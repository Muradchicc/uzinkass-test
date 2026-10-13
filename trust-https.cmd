@echo off
rem Mijoz kompyuterda ADMINISTRATOR sifatida bir marta ishga tushiriladi.
rem Server sertifikatini "ishonchli" deb o'rnatadi - shundan keyin https://SERVER
rem ogohlantirishsiz to'g'ridan-to'g'ri http://SERVER ga o'tadi.
rem Ishlatish:  trust-https.cmd 10.0.57.208
setlocal
set "SERVER=%~1"
if "%SERVER%"=="" set "SERVER=10.0.57.208"
set "CERT=%TEMP%\uzinkass-cert.cer"

curl -s -f -o "%CERT%" "http://%SERVER%/uzinkass-cert.cer"
if errorlevel 1 (
  echo Sertifikatni yuklab bo'lmadi: http://%SERVER%/uzinkass-cert.cer
  exit /b 1
)
certutil -addstore -f Root "%CERT%"
if errorlevel 1 (
  echo O'rnatib bo'lmadi. Bu faylni administrator sifatida ishga tushiring.
  exit /b 1
)
del "%CERT%"
echo Tayyor. Brauzerni yopib qayta oching.
