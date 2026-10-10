# Samy: Your Health Helper

Free chronic illness and general health tracker built with Expo (SDK 57), Expo Router and Supabase.

## Getting started

```bash
npm install
cp .env.example .env   # add your Supabase URL and anon key
npx expo start
```

The dashboard runs on mock data, so the app renders before Supabase is configured.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run lint` | ESLint (Expo config) |
| `npm run typecheck` | TypeScript, no emit |

## Structure

```
app/
  _layout.tsx          Root stack
  index.tsx            Auth screen (temporary redirect to the dashboard)
  (tabs)/
    _layout.tsx        Bottom tabs
    dashboard.tsx      Greeting, Samy promo banners, daily log button, recent logs
components/
  PromoBanner.tsx      Walk-in clinic / pharmacy refill / primary care promotions
constants/
  theme.ts             Colour palette, radii, spacing, shadows
services/
  supabase.ts          Supabase client, table types and data helpers
```
