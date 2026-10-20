# ChickNPastil Branch App

A small Express application for the ChickNPastil branch workflow. The server hosts the front-end files from `app/` and serves through the route folder.

## Requirements

- [Node.js](https://nodejs.org/) (which includes npm)

## Setup and run

Run these commands from the project root folder (the folder containing `package.json`):

```sh
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser. The root URL redirects to the supply requisition page. Supply pages are available at URLs such as:

- `/supply/requisition`
- `/supply/inventory`
- `/supply/request_expenses`
- `/supply/approve_expenses`
- `/supply/manage_fulfillment`
- `/supply/receive_fulfillment`

Stop the server with `Ctrl+C` in the terminal.

The server listens on port `3000`, as configured in `server.js`. There are currently no environment variables to configure.

## Project structure

```text
.
├── app/
│   ├── assets/
│   │   ├── css/          # Stylesheets
│   │   ├── html/         # Reusable HTML snippets and components
│   │   └── img/          # Images and other visual assets
│   ├── js/
│   │   ├── shared/       # JavaScript shared across pages
│   │   ├── supply/       # Supply-page JavaScript
│   │   └── user/         # User-page JavaScript
│   └── pages/
│       ├── supply/       # Supply workflow pages
│       ├── template/     # Page templates
│       └── user/         # Login and user pages
├── routes/
│   └── supply.js         # Express routes for supply pages
├── server.js             # Express app setup and server entry point
├── package.json          # Project metadata, scripts, and dependencies
└── package-lock.json     # Locked npm dependency versions
```

## Folder and file conventions

- Keep browser-facing HTML in `app/pages/`, grouped by feature (for example, `app/pages/supply/`).
- Supply HTML filenames map to supply URLs without the `.html` extension. For example, `app/pages/supply/inventory.html` is served at `/supply/inventory`.
- Put CSS, images, and reusable HTML assets in the corresponding `app/assets/` subfolders.
- Put browser JavaScript in `app/js/`, grouped by feature. Use `shared/` for code used by multiple features.
- Put Express route modules in `routes/` and register them in `server.js`.
- Keep dependencies and npm scripts in `package.json`; run `npm install` from the project root after cloning or changing dependencies.

## Available npm scripts

- `npm start` — starts the Express server with Node.js.
- `npm test` — no test suite is configured yet.
