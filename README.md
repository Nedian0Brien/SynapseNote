<div align="center">
  <div align="center">
    <h1>AppFlowy Web</h1>
  </div>
  <img src="https://img.shields.io/badge/React-v18.2.0-blue"/>
  <img src="https://img.shields.io/badge/TypeScript-v4.9.5-blue"/>
  <img src="https://img.shields.io/badge/Nginx-v1.21.6-brightgreen"/>
  <img src="https://img.shields.io/badge/Bun-latest-black"/>
  <img src="https://img.shields.io/badge/Docker-v20.10.12-blue"/>
</div>

## 🌟 Introduction

Welcome to the AppFlowy Web project! This project aims to bring the powerful features of AppFlowy to the web. Whether
you're a developer looking to contribute or a user eager to try out the latest features, this guide will help you get
started.

AppFlowy Web is built with the following technologies:

- **React**: A JavaScript library for building user interfaces.
- **TypeScript**: A typed superset of JavaScript that compiles to plain JavaScript.
- **Bun**: A fast all-in-one JavaScript runtime.
- **Nginx**: A high-performance web server.
- **Docker**: A platform to develop, ship, and run applications in containers.

### Resource Sharing

To maintain consistency across different platforms, the Web project shares i18n translation files and Icons with the
Flutter project. This ensures a unified user experience and reduces duplication of effort in maintaining these
resources.

- **i18n Translation Files**: The translation files are shared to provide a consistent localization experience across
  both Web and Flutter applications. The path to the translation files is `frontend/resources/translations/`.

  > The translation files are stored in JSON format and contain translations for different languages. The files are
  named according to the language code (e.g., `en.json` for English, `es.json` for Spanish, etc.).

- **Icons**: The icon set used in the Web project is the same as the one used in the Flutter project, ensuring visual
  consistency. The icons are stored in the `frontend/resources/flowy_icons/` directory.

Let's dive in and get the project up and running! 🚀

## 🛠 Getting Started

### Prerequisites

Before you begin, make sure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v18.6.0) 🌳
- [pnpm](https://pnpm.io/) (package manager) 📦
- [Jest](https://jestjs.io/) (testing framework) 🃏
- [Cypress](https://www.cypress.io/) (end-to-end testing) 🧪

### Clone the Repository

First, clone the repository to your local machine:

```bash
git clone https://github.com/AppFlowy-IO/AppFlowy-Web.git
```

### Install Dependencies

Install the required dependencies using pnpm:

```bash
## ensure you have pnpm installed, if not run the following command
# npm install -g pnpm@8.5.0

pnpm install
```

### Configure Environment Variables

This section assumes that you have deployed AppFlowy Cloud, and is accessible via the domain `your-domain`.
Create a `.env` file in the root of the project and add the following environment variables:

```bash
AF_BASE_URL=http://your-domain
AF_GOTRUE_URL=http://your-domain/gotrue
AF_WS_URL=ws://your-domain/ws/v1
# If you are using HTTPS, use wss instead of ws.
# AF_WS_URL=wss://your-domain/ws/v1
```

Make sure that AppFlowy Cloud deployment has been configured to allow CORS requests from the domain
where the web app is hosted. By defaut, if you run AppFlowy Web locally, that would be http://localhost:3000.

### Start the Development Server

To start the development server, run the following command:

```bash
pnpm run dev
```

### 🚀 Building for Production(Optional)

if you want to run the production build, use the following commands

```bash
pnpm run build
pnpm run start
```

This will start the application in development mode. Open http://localhost:3000 to view it in the browser.

## 🧪 Running Tests

### Unit Tests

We use **Jest** for running unit tests. To run the tests, use the following command:

```bash
pnpm run test:unit
```

This will execute all the unit tests in the project and provide a summary of the results. ✅

### Components Tests

We use **Cypress** for end-to-end testing. To run the Cypress tests, use the following command:

```bash
pnpm run cypress:open
```

This will open the Cypress Test Runner where you can run your end-to-end tests. 🧪

Alternatively, to run Cypress tests in the headless mode, use:

```bash
pnpm run test:components
```

Both commands will provide detailed test results and generate a code coverage report.

## 🔄 Development Workflow

### Linting

To maintain code quality, we use **ESLint**. To run the linter and fix any linting errors, use the following command:

```bash
pnpm run lint
```

## 🚀 Production Deployment

You can run the production build via `pnpm`, as described above. Alternatively, you can also
deploy AppFlowy Web via the following ways:

### Vercel
This is only possible if your AppFlowy Cloud endpoints are accessible publicly. First, fork
this repository, then import the forked repository into Vercel. You can then configure the
environment variables during the setup.

Once AppFlowy Web has been deployed via Vercel, make sure that the AppFlowy Cloud deployment
has been updated to allow CORS requests from the domain (eg. yourpoject.vercel.app).

### Docker
If you prefer to deploy the application using Docker, you can build the Docker image via
`make image`. The API endpoints are baked into the image during the build process, so make
sure that the .env file has been configured correctly before building the image.

You can modify the image name by editing `IMAGE_NAME` in Makefile.

Then, you can run the Docker container via

```bash
docker rm -f appflowy-web-app || true
docker run -d -p 80:80 -p 443:443 --name appflowy-web-app appflowy-web-app
```

If you are running this on the same machine that is already running AppFlowy Cloud,
make sure to change the port mappings to avoid conflicts.
