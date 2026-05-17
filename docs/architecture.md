# Архитектура

- `GameApp` управляет экранами и игровым циклом.
- `YandexSdkService` инкапсулирует SDK, язык, LoadingAPI, GameplayAPI и рекламу.
- `LocalizationService` отдаёт UI-строки через `t(...)`.
- `SaveService` хранит прогресс и настройки с версией миграции.
- Игровая логика разделена на системы в `src/systems/systems.ts`.
