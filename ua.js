(function () {
    'use strict';

    function UAFixPlugin() {
        let network = new Lampa.Reguest();
        let current_card = null;
        
        // Безкоштовний CORS-проксі для ТБ-платформ
        let cors_proxy = "https://api.allorigins.win/raw?url=";
        let uafix_base = "https://uafix.net"; 

        this.start = function (component) {
            current_card = component.card;
            
            // Кнопка в інтерфейсі картки Lampa
            let button = $(`<div class="full-start__button selector button--uafix" style="border-left: 4px solid #FFD700;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.507em;height:1.507em;margin-right:10px;vertical-align:middle;color:#0057B7;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>UAFix UA</span>
            </div>`);

            button.on('hover:enter', () => {
                this.searchInUAFix();
            });

            component.find('.full-start__buttons').append(button);
        };

        // Функція пошуку на uafix.net
        this.searchInUAFix = function () {
            Lampa.Loading.show();
            
            let title = current_card.title || current_card.name;
            
            // Формуємо пошуковий URL для uafix.net (стандартний рушій пошуку по базі)
            let search_url = cors_proxy + encodeURIComponent(uafix_base + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(title));

            network.silent(search_url, (html) => {
                this.parseSearchHtml(html, title);
            }, () => {
                Lampa.Loading.hide();
                Lampa.Noty.show('Помилка мережі або CORS проксі');
            }, false, {dataType: 'text'});
        };

        // Парсинг результатів пошуку з сайту uafix.net
        this.parseSearchHtml = function (html, searchTitle) {
            let dom = $(html);
            let found_items = [];

            // Шукаємо посилання на картки (зазвичай блоки .shortstory, .movie-item або посилання з /video/ чи /films/)
            dom.find('a[href*="/video/"], a[href*="/films/"], .shortstory a, .movie-item a').each(function () {
                let link = $(this).attr('href');
                let title = $(this).text() || $(this).attr('title') || $(this).find('img').attr('alt');
                
                if (link && title && title.trim().length > 2) {
                    // Перевіряємо відносні посилання
                    if (link.indexOf('http') === -1) link = uafix_base + link;
                    
                    // Уникаємо дублікатів у списку результатів
                    if (!found_items.some(item => item.url === link)) {
                        found_items.push({
                            title: title.trim(),
                            url: link
                        });
                    }
                }
            });

            if (found_items.length === 0) {
                Lampa.Loading.hide();
                Lampa.Noty.show('Нічого не знайдено на UAFix');
                return;
            }

            Lampa.Loading.hide();
            
            // Меню вибору для користувача в інтерфейсі Лампи
            Lampa.Select.show({
                title: 'Результати UAFix',
                items: found_items.map(i => ({ title: i.title, link: i.url })),
                onSelect: (item) => {
                    this.extractVideoUrl(item.link);
                },
                onBack: () => {
                    Lampa.Controller.toggle('full');
                }
            });
        };

        // Витягуємо код плеєра зі сторінки фільму
        this.extractVideoUrl = function (pageUrl) {
            Lampa.Loading.show();

            let target_url = cors_proxy + encodeURIComponent(pageUrl);

            network.silent(target_url, (html) => {
                Lampa.Loading.hide();
                
                // Шукаємо посилання на плеєри (теги iframe або змінні в скриптах)
                let player_match = html.match(/iframe.*?src="(.*?)"/) || 
                                   html.match(/file\s*:\s*"(.*?)"/) ||
                                   html.match(/"file"\s*:\s*"(.*?)"/);
                
                if (player_match && player_match[1]) {
                    let streamUrl = player_match[1];

                    // Якщо це відносне посилання на iframe типу //uafix.net/player...
                    if (streamUrl.indexOf('//') === 0) streamUrl = 'https:' + streamUrl;

                    if (streamUrl.indexOf('.m3u8') !== -1) {
                        this.playVideo(streamUrl);
                    } else {
                        // Якщо це посилання на iframe (наприклад, інтегрований плеєр), заходимо всередину
                        this.extractFromIframe(streamUrl);
                    }
                } else {
                    Lampa.Noty.show('Не вдалося знайти плеєр на сторінці фільму');
                }
            }, () => {
                Lampa.Loading.hide();
                Lampa.Noty.show('Помилка завантаження сторінки фільму');
            }, false, {dataType: 'text'});
        };

        // Парсинг самого iframe плеєра для отримання прямого .m3u8
        this.extractFromIframe = function (iframeUrl) {
            Lampa.Loading.show();
            let target_url = cors_proxy + encodeURIComponent(iframeUrl);

            network.silent(target_url, (html) => {
                Lampa.Loading.hide();
                
                // Шукаємо пряме m3u8 посилання всередині коду плеєра (підтримує різні типи плеєрів на uafix)
                let file_match = html.match(/file\s*:\s*"(.*?)"/) || 
                                 html.match(/"file"\s*:\s*"(.*?)"/) || 
                                 html.match(/src\s*:\s*"(.*?\.m3u8.*?)"/) ||
                                 html.match(/"url"\s*:\s*"(.*?\.m3u8.*?)"/);
                
                if (file_match && file_match[1]) {
                    let finalUrl = file_match[1];
                    // Деякі плеєри кодують посилання в Base64, якщо побачимо кракозябри, додамо декодер. Спершу пробуємо пряме:
                    this.playVideo(finalUrl);
                } else {
                    Lampa.Noty.show('Прямий потік відео не знайдено в плеєрі');
                }
            }, () => {
                Lampa.Loading.hide();
                Lampa.Noty.show('Помилка парсингу iframe плеєра');
            }, false, {dataType: 'text'});
        };

        // Запуск вбудованого плеєра Lampa
        this.playVideo = function (url) {
            let videoData = {
                url: url,
                title: current_card.title || current_card.name
            };
            Lampa.Player.play(videoData);
            Lampa.Player.callback(() => {
                Lampa.Controller.toggle('full');
            });
        };
    }

    // Реєстрація розширення в системі Lampa
    if (window.appready) {
        let uaFixExt = new UAFixPlugin();
        Lampa.Listener.follow('full', function (e) {
            if (e.name == 'complite') {
                uaFixExt.start(e.object);
            }
        });
    }
})();
