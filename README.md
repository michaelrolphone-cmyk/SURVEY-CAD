# SURVEY-CAD Launcher

This repository contains standalone HTML utilities and a launcher page (`index.html`) that provides an app-switcher style shell to open each utility in an iframe.

## Included Apps
- `CPNF.HTML`
- `POINT_TRANSFORMER.HTML`
- `ROS.html`
- `VIEWPORT.HTML`

## Run Locally
Open the launcher directly:

```bash
xdg-open index.html
```

Or serve the directory (recommended for browser security compatibility):

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/index.html`

## API Endpoints
This project is static HTML and does not expose backend API endpoints.

## CLI Commands
- Run unit tests:

```bash
python3 -m unittest -v
```
