# Restore from a backup

Do this once as a drill before you rely on the CRM, then every 3 months. A backup only counts once you've restored it.

You need: the encrypted backup file and its manifest (GitHub, your repository, Actions, the latest "nightly-backup" run, Artifacts), your private backup key (from your password manager), and a computer with Node.js, the Postgres client and `age` installed. Your AI agent can install them.

1. **Make a blank project.** Create a new Supabase project. Never restore into the project you're trying to save.
2. **Get the connection string.** New project, Connect, "Session pooler" string. Keep it out of chats.
3. **Save the key to a file** on your computer, for example `~/crm-backup-key.txt`. Delete it when you're done.
4. **Run the restore** in this folder:
   ```
   TARGET_DB_URL='<connection string>' AGE_IDENTITY_FILE=~/crm-backup-key.txt \
     bash scripts/restore-to-blank.sh <backup file .age> <manifest file .json>
   ```
   It refuses a project that already has contacts, applies every migration, loads the data, and compares every table's row count with the manifest. You should see "Restore verified: every table matches the backup."
5. **If a count doesn't match,** stop. Don't switch over. Ask your agent to explain the line that says MISMATCH.
6. **Make your login.** In the new project: Authentication, turn off signups, turn on TOTP, Add user, then in the SQL editor `insert into public.app_owner (user_id) values ('<your user id>');`. Logins aren't in backups on purpose.
7. **Switch over (real restore only).** Put the new project's URL and keys in Vercel's settings and redeploy. Re-enroll your authenticator.
8. **Drill only:** press "I finished a restore drill" on Status, then delete the drill project.

The restore script is tested on a blank local database by `npm run test:restore` (part of `npm run gate`).
