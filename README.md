#AI Daily Todo Reminder
-----------------------
A clean, date-based todo app built with React, TypeScript, Vite, and Supabase.

It helps you plan daily tasks, track completion, roll over unfinished work, and stay on track with browser notifications.

#Features
Add, edit, complete, and delete tasks
View tasks by selected date
Completion progress indicator for each day
Roll over pending tasks from the previous day
Browser notification support for reminders
Supabase-backed persistence (PostgreSQL)

#Tech Stack
React 18
TypeScript
Vite
Tailwind CSS
Supabase (Database + optional Edge Function)

#Project Structure
src/App.tsx: Main UI and task workflows
src/components/AddTaskForm.tsx: Add task form
src/components/TaskItem.tsx: Task display, edit, complete, delete actions
src/lib/supabase.ts: Supabase client setup
src/services/scheduler.ts: In-browser reminder scheduler
supabase/migrations/20260331164312_create_tasks_table.sql: Tasks table schema
supabase/functions/schedule-notifications/index.ts: Optional server-side scheduler logic


#Database Schema
The app uses a tasks table with these fields:
id: uuid primary key
user_id: uuid (reserved for auth ownership)
title: text
completed: boolean
task_date: date
created_at: timestamptz
completed_at: timestamptz nullable


#Getting Started
1) Prerequisites
Node.js 18+ (Node.js 20 recommended)
npm
A Supabase project
2) Install dependencies
npm install

3) Configure environment variables
Create a .env file in the project root and add:

VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

4) Create database table
Run the SQL migration in your Supabase project SQL editor:

20260331164312_create_tasks_table.sql
5) Start development server
npm run dev

Then open the local URL shown in terminal.

#Available Scripts
npm run dev: Start local development server
npm run build: Create production build
npm run preview: Preview production build locally
npm run lint: Run ESLint
npm run typecheck: Run TypeScript type checks


#Deployment
This app can be deployed as a static frontend (for example, GitHub Pages, Netlify, Vercel).
Make sure production environment variables are configured:

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
If using GitHub Pages, ensure the Vite base path matches your repository name.

#Security Notes
Current migration includes a development policy that allows anonymous access to tasks.
Before production, tighten RLS policies and enforce authenticated access per user.

#Roadmap
User authentication and per-user task isolation
Recurring tasks
Better reminder scheduling and timezone controls
Mobile PWA support

