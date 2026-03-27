# UIGen — React Component Generator

## Назначение проекта
Веб-приложение для генерации React-компонентов через чат с ИИ.
Пользователь описывает компонент — ИИ создаёт файлы в виртуальной
файловой системе — результат сразу виден в live preview.

## Архитектура
- Next.js 15 + App Router (full-stack framework)
- React 19 (клиентский интерфейс)
- Vercel AI SDK (стриминг, tool calling)
- Prisma + SQLite (сохранение проектов)
- Виртуальная файловая система (file-system.ts)
- Monaco Editor (редактор кода в браузере)
- Babel + iframe (live preview без сборки)

## Ключевые файлы
- `src/app/main-content.tsx` — главный экран
- `src/app/api/chat/route.ts` — AI API маршрут
- `src/lib/file-system.ts` — виртуальная файловая система
- `src/lib/provider.ts` — выбор LLM модели
- `src/lib/contexts/chat-context.tsx` — состояние чата
- `src/lib/contexts/file-system-context.tsx` — состояние файлов
- `src/components/preview/PreviewFrame.tsx` — live preview
- `prisma/schema.prisma` — схема базы данных

## База данных
При вопросах о структуре данных смотри prisma/schema.prisma
Две сущности: User и Project
Project хранит messages и data как JSON-строки

## Правила написания кода
- Используй TypeScript везде
- Не добавляй лишние комментарии в код
- Следуй существующим паттернам проекта
- Используй server actions для работы с БД