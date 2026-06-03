(function () {
    'use strict';

    function UAFixBalancer() {
        let network = new Lampa.Reguest();
        // Використовуємо всеїдний проксі для обходу CORS на ТБ
        let cors_proxy = "https://api.allorigins.win/raw?url=";
        let uafix_base = "https://uafix.net";

        // Метод, який Lampa автоматично викликає при відкритті меню "Дивитись"
        this.search = function (match, card) {
            let title = card.title || card.name;
            let search_url = cors_proxy + encodeURIComponent(uafix_base + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(title));

            network.silent(search_url, (html) => {
                this.parseSearch(html, match);
            }, () => {
                match.clear();
                Lampa.Noty.show('UAFix: Помилка мережі');
            }, false, {dataType: 'text'});
        };

        // Парсимо пошукову видачу сайту uafix.net
        this.parseSearch = function (html, match) {
            let dom = $(html);
            let found_items = [];

            // Шукаємо лінки на фільми/серіали за структурою сайту
            dom.find('a[href*="/video/"], a[href*="/films/"], .shortstory a, .movie-item a').each(function () {
                let link = $(this).attr('href');
                let title = $(this).text() || $(this).attr('title') || $(this).find('img').attr('alt');
                
                if (link && title && title.trim().length > 2) {
                    if (link.indexOf('http') === -1) link = uafix_base + link;
                    
                    if (!found_items.some(item => item.url === link)) {
                        found_items.push({
                            title: title.trim(),
                            url: link
                        });
                    }
                }
            });

            if (found_items.length === 0) {
                match.clear(); // Якщо нічого не знайшли, закриваємо пошук по цьому балансеру
                return;
            }

            // Перетворюємо знайдені елементи у формат, який розуміє плеєр Lampa
            let results = found_items.map(item => {
                return {
                    title: item.title,
                    quality: 'UA',
                    translation: 'UAFix (Безкоштовно)',
                    url: item.url,
                    template: 'video',
                    callback: () => {
                        this.extractStream(item.url, item.title);
                    }
                };
            });

            // Віддаємо результат у загальний список джерел
            match.success(results);
        };

        // Витягуємо потік, коли користувач клікнув на фільм у списку
        this.extractStream = function (pageUrl, videoTitle) {
            Lampa.Loading.show();
            let target_url = cors_proxy + encodeURIComponent(pageUrl);

            network.silent(target_url, (html) => {
                Lampa.Loading.hide();
                
                let player_match = html.match(/iframe.*?src="(.*?)"/) || 
                                   html.match(/file\s*:\s*"(.*?)"/) ||
                                   html.match(/"file"\s*:\s*"(.*?)"/);
                
                if (player_match && player_match[1]) {
                    let streamUrl = player_match[1];
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
                Lampa.Noty.show('Помилка завантаження сторінки');
            }, false, {dataType: 'text'});
        };

        // Парсинг iframe плеєра, якщо відео всередині фрейму
        this.extractFromIframe = function (iframeUrl, videoTitle) {
            Lampa.Loading.show();
            let target_url = cors_proxy + encodeURIComponent(iframeUrl);

            network.silent(target_url, (html) => {
                Lampa.Loading.hide();
                
                let file_match = html.match(/file\s*:\s*"(.*?)"/) || 
                                 html.match(/"file"\s*:\s*"(.*?)"/) || 
                                 html.match(/src\s*:\s*"(.*?\.m3u8.*?)"/) ||
                                 html.match(/"url"\s*:\s*"(.*?\.m3u8.*?)"/);
                
                if (file_match && file_match[1]) {
                    this.play(file_match[1], videoTitle);
                } else {
                    Lampa.Noty.show('Потік відео не знайдено');
                }
            }, () => {
                Lampa.Loading.hide();
                Lampa.Noty.show('Помилка парсингу плеєра');
            }, false, {dataType: 'text'});
        };

        // Запуск рідного плеєра Lampa
        this.play = function (url, title) {
            let videoData = {
                url: url,
                title: title
            };
            Lampa.Player.play(videoData);
            Lampa.Player.callback(() => {
                Lampa.Controller.toggle('full');
            });
        };
    }

    // Реєструємо плагін як офіційний балансер контенту
    if (window.appready) {
        Lampa.Component.add('uafix_mod', UAFixBalancer);
        
        // Підключаємося до події пошуку у вікні джерел
        Lampa.Listener.follow('extension', function (e) {
            if (e.name == 'search' && e.plugin == 'uafix_mod') {
                let balancer = new UAFixBalancer();
                balancer.search(e.match, e.card);
            }
        });
    }
})();
