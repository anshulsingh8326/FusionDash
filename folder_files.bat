@echo off
set PROJECT_NAME=FusionDash_Main

echo Creating project structure: %PROJECT_NAME%

REM Root folder
mkdir %PROJECT_NAME%
cd %PROJECT_NAME%

REM Backend
mkdir backend
type nul > backend\main.py
type nul > backend\docker_scan.py
type nul > backend\models.py
type nul > backend\requirements.txt

REM Frontend
mkdir frontend
type nul > frontend\index.html
type nul > frontend\app.js
type nul > frontend\style.css

REM Docker
mkdir docker
type nul > docker\Dockerfile
type nul > docker\entrypoint.sh

REM Root files
type nul > docker-compose.yml
type nul > README.md
type nul > .gitignore

echo.
echo Project structure created successfully.
pause
