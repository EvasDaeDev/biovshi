# Авторы и лицензии — БиоВши

## Создание игры

**Станислав EvasDae Гирдо** — автор идеи, концепции, дизайна, игровых механик и творческий руководитель проекта.

**ChatGPT (OpenAI)** — исполнитель технической реализации и программирования по заданию автора проекта.

## Музыка

**The Flower Duet (из оперы Lakmé)**
- Композитор: Léo Delibes.
- Исполнение: под управлением Philip Milman.
- Источник: https://www.classicals.de/delibes-flower-duet
- Лицензия записи: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
- При использовании отредактированной записи: сокращение длительности, изменение громкости и зацикливание для фоновой музыки игры.

**Long Note Three**
- Композитор: Kevin MacLeod.
- Источник: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100424
- Лицензия записи: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
- Версия для игры сокращена до 3:00, зациклена и воспроизводится на пониженной громкости.

Указание авторства распространяется на соответствующую запись; оно не означает, что авторы музыки поддерживают или одобряют игру.

## Шрифты

Шрифты распространяются по SIL Open Font License 1.1. В сборку входят оригинальные файлы WOFF2 из Google Fonts с кириллицей и латиницей и тексты лицензий.

| Шрифт | Правообладатели | Исходный проект | Лицензия |
| --- | --- | --- | --- |
| Kelly Slab | Denis Masharov | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/kellyslab) | [OFL 1.1](public/fonts/KellySlab-OFL.txt) |
| IBM Plex Mono | IBM Corp. | [IBM Plex](https://github.com/IBM/plex) | [OFL 1.1](public/fonts/IBMPlexMono-OFL.txt) |
| Rubik Distressed | The Rubik Filtered Project Authors | [Rubik Filtered](https://github.com/NaN-xyz/Rubik-Filtered) | [OFL 1.1](public/fonts/RubikDistressed-OFL.txt) |

## Другие звуковые и графические материалы

Сведения об источниках остальных используемых ресурсов будут добавляться сюда по мере проверки их лицензий. Этот файл не изменяет условия лицензирования сторонних материалов.

## Telegram Mini Apps SDK

Основная и тестовая веб-сборки загружают официальную копию JavaScript SDK в окружении Telegram.
https://telegram.org/js/telegram-web-app.js?65

Копия размещена в `public/vendor/telegram-web-app-65.js` для загрузки с адреса игры.
Источник, дата получения и контрольная сумма указаны в [метаданных SDK](public/vendor/telegram-web-app-65.json). [Подробности интеграции](docs/TELEGRAM.md).
