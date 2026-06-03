(function () {
    'use strict';

    // Використовуємо перевірений CORS-проксі
    let cors_proxy = "https://api.allorigins.win/raw?url=";
    let uafix_base = "https://uafix.net";

    function UAFixComponent(object) {
        let network = new Lampa.Reguest();
        let scroll = Lampa.Template.get('scroll');
        let items = [];

        this.create = function () {
            this.activity.loader(true);
            
            let title = object.card.title || object.card.name;
            let search_url = cors_proxy + encodeURIComponent(uafix_base + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(title));

            // Точно такий же запит, як у робочому плагіні
            network.silent(search_url, (html) => {
                let dom = $(html);
                let found = [];

                dom.find('a[href*="/video/"], a[href*="/films/"], .shortstory a, .movie-item a').each(function () {
                    let link = $(this).attr('href');
                    let name = $(this).text() || $(this).attr('title') || $(this).find('img').attr('alt');
                    
                    if (link && name && name.trim().length > 2) {
                        if (link.indexOf('http') === -1) link = uafix_base + link;
                        if (!found.some(item => item.url === link)) {
                            found.push({ title: name.trim(), url: link });
                        }
                    }
                });

                this.activity.loader(false);

                if (found.length === 0) {
                    this.empty();
                } else {
                    this.buildMenu(found);
                }
            }, () => {
                this.activity.loader(false);
                this.empty('Помилка мережі UAFix');
            }, false, {dataType: 'text'});

            return scroll.render();
        };

        this.buildMenu = function (found) {
            found.forEach(item => {
                let card = Lampa.Template.get('button', {
                    title: item.title,
                    description: 'Українська якість (UAFix)'
                });

                card.on('hover:enter', () => {
                    this.extractStream(item.url, item.title);
                });

                scroll.append(card);
            });

            Lampa.Controller.enable('content');
        };

        this.extractStream = function (pageUrl, videoTitle) {
            Lampa.Loading.show();
            network.silent(cors_proxy + encodeURIComponent(pageUrl), (html) => {
                Lampa.Loading.hide();
                let match = html.match(/iframe.*?src="(.*?)"/) || html.match(/file\s*:\s*"(.*?)"/);
                
                if (match && match[1]) {
                    let streamUrl = match[1];
                    if (streamUrl.indexOf('//') === 0) streamUrl = 'https:' + streamUrl;

                    if (streamUrl.indexOf('.m3u8') !== -1) {
                        this.play(streamUrl, videoTitle);
                    } else {
                        this.extractFromIframe(streamUrl, videoTitle);
                    }
                } else {
                    Lampa.Noty.show('Не вдалося знайти плеєр');
                }
            }, () => {
                Lampa.Loading.hide();
                Lampa.Noty.show('Помилка завантаження');
            }, false, {dataType: 'text'});
        };

        this.extractFromIframe = function (iframeUrl, videoTitle) {
            Lampa.Loading.show();
            network.silent(cors_proxy + encodeURIComponent(iframeUrl), (html) => {
                Lampa.Loading.hide();
                let file = html.match(/file\s*:\s*"(.*?)"/) || html.match(/"file"\s*:\s*"(.*?)"/) || html.match(/src\s*:\s*"(.*?\.m3u8.*?)"/);
                
                if (file && file[1]) {
                    this.play(file[1], videoTitle);
                } else {
                    Lampa.Noty.show('Відеопотік не знайдено');
                }
            }, () => {
                Lampa.Loading.hide();
                Lampa.Noty.show('Помилка плеєра');
            }, false, {dataType: 'text'});
        };

        this.play = function (url, title) {
            let videoData = { url: url, title: title };
            Lampa.Player.play(videoData);
            Lampa.Player.callback(() => {
                Lampa.Controller.toggle('full');
            });
        };

        this.empty = function (msg) {
            let empty = Lampa.Template.get('empty', {title: 'Нічого не знайдено', desc: msg || 'На UAFix немає цього контенту'});
            scroll.append(empty);
        };
    }

    // Рідна інтеграція у вікно балансерів Lampa (копіюємо поведінку Rezka Component)
    if (window.appready) {
        Lampa.Component.add('uafix_mod', UAFixComponent);

        Lampa.Listener.follow('extension', function (e) {
            if (e.name == 'search' && (!e.plugin || e.plugin == 'uafix_mod')) {
                // Додаємо наш UAFix в офіційний список джерел під головну кнопку "Дивитись"
                e.match.success([{
                    title: 'UAFix (Безкоштовно)',
                    quality: 'HD',
                    translation: 'Українська',
                    template: 'video',
                    callback: function () {
                        Lampa.Activity.push({
                            url: '',
                            title: 'UAFix',
                            component: 'uafix_mod',
                            card: e.card,
                            page: 1
                        });
                    }
                }]);
            }
        });
    }
})();
