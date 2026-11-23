# Документация БИОВШИ

[Основная игра](https://evasdaedev.github.io/biovshi/) ·
[Тестовая игра](https://evasdaedev.github.io/biovshi/test/) ·
[bio_editor](https://evasdaedev.github.io/biovshi/bio_editor/)

Документация описывает `test/combat-hit-sync`. Состав основной веб-сборки
определяет ветка `main`. Сведения о канале, интервале боссов и точном коммите
доступны в [основном](https://evasdaedev.github.io/biovshi/build-info.json) и
[тестовом](https://evasdaedev.github.io/biovshi/test/build-info.json) `build-info.json`.

## Игровые правила

| Раздел | Документ |
| --- | --- |
| Управление, бой, этажи, прогресс, ДМС и следы на полу | [Башня](TOWER.md) |
| Дроп, экипировка, продажа и редкость | [Сегментные модификации](tower-segment-modifiers.md) |
| Боссы, таблица шансов и история настройки ИИ | [Боссы и артефакты](BOSSES.md) |
| Ставки, джекпот и отмена раунда | [Тотализатор](BETTING.md) |
| Сценарии подсказок | [Обучение](TUTORIAL.md) |

## Редакторы, сборка и проверка

| Задача | Документ |
| --- | --- |
| Запуск, устройство проекта и публикация | [README проекта](../README.md) |
| Локации, пивоты, спавны и перенос координат скелета | [Редакторы](EDITORS.md) |
| Правила работы с ассетами | [Сборка и текстуры](ASSET_BUILD_RULES.md), [атласы модификаций](../public/assets/textures/robots/upgrades/README.md), [рабочие исходники](../_src/README.md) |
| Полный прогон перед публикацией | [Проверки](VALIDATION.md) |
| Ручная приёмка тестовой игры и редактора | [Чек-лист](TOWER_PART_2_TESTER_CHECKLIST.md) |
| Запуск внутри Telegram и проверка WebView | [Telegram](TELEGRAM.md) |
| Сенсорный ввод и экранная клавиатура | [Мобильный ввод](MOBILE_INPUT.md) |
| Источники ресурсов и авторство | [CREDITS](../CREDITS.md) |

## Спецификации и исследования

- [UI/UX](UI_UX_REDESIGN_SPEC.md) описывает требования к интерфейсу.
- [Сетевая арена LAN](LAN_MULTIPLAYER.md) содержит проект локального мультиплеера.
- [История Башни II](TOWER_PART_2_IMPLEMENTATION.md), [первая часть roguelite](TOWER_ROGUELITE_EXPERIMENT.md) и [проект второй части](TOWER_ROGUELITE_PART_2.md) содержат этапы разработки и ранние правила.
- [Накопленная травма](TRAUMA_EXPERIMENT.md), [анализ производительности](PERFORMANCE.md) и [экспериментальные отчёты](experiments/README.md) фиксируют конкретные прогоны и условия измерений.
