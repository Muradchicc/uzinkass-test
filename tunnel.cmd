@echo off
rem Lokal serverni (80-port) Cloudflare tunnel orqali internetga chiqaradi.
rem Havola "https://....trycloudflare.com" ko'rinishida konsolda chiqadi.
set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist "%CF%" set "CF=cloudflared"
"%CF%" tunnel --url http://localhost:80 --no-autoupdate
