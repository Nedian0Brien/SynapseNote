<h1 align="center" style="border-bottom: none">AppFlowy Web<br>
⭐️ The Open Source Notion Alternative ⭐️
</h1>
<p align="center"> Use AppFlowy right in <a href="https://www.appflowy.com">your browser</a><br>
</p>


<p align="center">
Bring projects, wikis, and teams together with AI
</p>
<p align="center">
    <a href="http://appflowy.com"><b>Web</b></a> •
    <a href="https://appflowy.com/download">Apps</a> •
    <a href="https://discord.gg/9Q2xaN37tV"><b>Discord</b></a> •
    <a href="https://twitter.com/appflowy"><b>Twitter</b></a> •
    <a href="https://www.reddit.com/r/appflowy/"><b>Reddit</b></a> •
    <a href="https://forum.appflowy.io/"><b>Forum</b></a>
</p>


![appflowy_web](https://github.com/user-attachments/assets/beb79630-b134-4de0-b464-d164cd0f9adf)
![appflowy_web_quickly_add_a_page](https://github.com/user-attachments/assets/364f6419-c214-46aa-92ff-bfcc0a4f93d6)
![appflowy_web_quick_note](https://github.com/user-attachments/assets/b67285df-6f89-416d-94e0-d0b82eb22359)
![appflowy_web_quick_note_large](https://github.com/user-attachments/assets/5c633e60-6f34-454c-91db-236a1b78966a)
![appflowy_web_share](https://github.com/user-attachments/assets/64b9955d-b11f-4aa1-b32b-ea79ea7f3566)

## Table of Contents

- [Use Cases](#use-cases)
- [Features](#features) 
- [AppFlowy Web Roadmap](#appflowy-web-roadmap)
- [Installation](#installation)
- [Development](#development)
  - [Environment Configuration](#environment-configuration)
  - [Running AppFlowy Web Locally](#running-appflowy-web-locally)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [License](#license)

## Use cases
- Build and maintain a knowledge base for your team
- Create and publish documentation for your customers and audience
- Write, publish, and manage content with AI
- Manage tasks and projects for yourself and your team

## Features
- Write beautiful documents with rich content types
- Add a Quick Note to jot down lists, ideas, or to-dos
- Invite members to your workspace for seamless collaboration
- Create multiple public and private spaces to better organize your content

## AppFlowy Web roadmap
>Features listed below are available in AppFlowy desktop and mobile applications (<a href="https://appflowy.io/download">Download</a>).


## Installation
### Cloud: we host AppFlowy for you
Sign up for a free account on <a href="https://appflowy.com">appflowy.com</a>—it's the fastest way to get started with AppFlowy without hassles

### Self-hosted: host AppFlowy on your own server
Take charge of your data; no vendor lock-in. Follow our <a href="https://appflowy.com/docs/self-host-appflowy-overview">deployment guide</a> to get started.
Join our <a href="https://discord.gg/FFmDE99bgA">Discord</a> server to get help!

## Built with 🛠️
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

## Development

### Prerequisites

**AppFlowy Cloud Setup:**
AppFlowy Cloud must be running and accessible by AppFlowy Web. If you already have AppFlowy Cloud running, you can skip to the [Environment Configuration](#environment-configuration) section.

**System Requirements:**
- Node.js ≥18.0.0
- pnpm ≥10.9.0
- Docker and Docker Compose (for AppFlowy Cloud)

**For new AppFlowy Cloud setup:**
1. Install [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
2. Clone the AppFlowy Cloud repository
3. **Choose the same configuration pattern for both repositories:**
   - **Standard deployment:** `cp deploy.env .env` (both AppFlowy Cloud and AppFlowy Web)
   - **Development setup:** `cp dev.env .env` (both AppFlowy Cloud and AppFlowy Web)
4. **Run the appropriate Docker Compose command in AppFlowy Cloud repository:**
   - **For deploy.env:** `docker compose up -d`
   - **For dev.env:** `docker compose --file ./docker-compose-dev.yml up -d`
5. Set up at least one sign-in method: SMTP for magic link, or using an OAuth provider

> **📖 For detailed AppFlowy Cloud setup instructions, refer to the [AppFlowy Cloud repository](https://github.com/AppFlowy-IO/AppFlowy-Cloud).**

### Environment Configuration

Both AppFlowy Cloud and AppFlowy Web have corresponding environment configurations that must be aligned:

#### Option 1: Production/Nginx Setup (`deploy.env`)
```bash
cp deploy.env .env
```
- Use when AppFlowy Cloud is deployed **with nginx** as reverse proxy
- All services accessed through nginx on port 80

#### Option 2: Development/Direct Access (`dev.env`)  
```bash
cp dev.env .env
```
- Use when running AppFlowy Cloud services **without nginx** on custom ports
- Direct connections to each service

> **📖 For detailed configuration information, architecture diagrams, and troubleshooting, see [Deployment Guide](doc/DEPLOYMENT.md)**

### Running AppFlowy Web Locally
1. **Choose and copy your environment configuration** (see options above)
2. **Install dependencies and start the development server:**
   ```bash
   corepack enable
   pnpm install
   pnpm run dev
   ```

3. **Open your browser** and visit http://localhost:3000

## Deployment
Once AppFlowy Cloud has been setup, you can follow the [deployment guide](https://appflowy.com/docs/self-host-appflowy-run-appflowy-web)
to deploy AppFlowy Web.

## Documentation

- **[Deployment Guide](doc/DEPLOYMENT.md)** - Detailed environment configuration, architecture diagrams, and troubleshooting
- **[AppFlowy Cloud Repository](https://github.com/AppFlowy-IO/AppFlowy-Cloud)** - Backend setup and configuration
- **[Official Documentation](https://appflowy.com/docs)** - Complete AppFlowy documentation

## License
Distributed under the AGPLv3 License. See [`LICENSE.md`](https://github.com/AppFlowy-IO/AppFlowy-Web/blob/main/LICENSE) for
more information.
