import express from 'express';
import dotenv from 'dotenv';
import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';

import prisma from './src/utils/prisma.js';
import { errorHandler, notFoundHandler } from './src/middleware/error.middleware.js';

import usersRoutes from './src/modules/users/users.routes.js';
import projectsRoutes from './src/modules/projects/projects.routes.js';
import materialsRoutes from './src/modules/materials/materials.routes.js';
import analysesRoutes from './src/modules/analyses/analyses.routes.js';
import marketplaceRoutes from './src/modules/marketplace/marketplace.routes.js';
import contactRequestsRoutes from './src/modules/contact-requests/contact-requests.routes.js';
import presetsRoutes from './src/modules/presets/presets.routes.js';

dotenv.config();

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CCAA Backend API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/projects/:projectId/materials', materialsRoutes);
app.use('/api/projects/:projectId/analyses', analysesRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/contact-requests', contactRequestsRoutes);
app.use('/api/presets', presetsRoutes);

const swaggerDocument = JSON.parse(
  fs.readFileSync(new URL('./src/config/swagger.json', import.meta.url))
);

app.get('/api-docs/swagger.json', (req, res) => {
  res.json(swaggerDocument);
});

app.get('/api-docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CCAA API Documentation</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
        <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" sizes="32x32" />
        <style>
          html { box-sizing: border-box; }
          *, *:before, *:after { box-sizing: inherit; }
          body { margin: 0; background: #fafafa; }
        </style>
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
        <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
        <script>
          window.onload = () => {
            window.ui = SwaggerUIBundle({
              url: '/api-docs/swagger.json',
              dom_id: '#swagger-ui',
              deepLinking: true,
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
              ],
              layout: "BaseLayout"
            });
          };
        </script>
      </body>
    </html>
  `);
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    app.listen(PORT, () => {
      console.log(`CCAA API running on http://localhost:${PORT}`);
      console.log(`Swagger UI Docs: http://localhost:${PORT}/api-docs`);
      console.log(`API Docs:`);
      console.log(`   GET  /api/users/me`);
      console.log(`   GET  /api/projects`);
      console.log(`   POST /api/projects`);
      console.log(`   POST /api/projects/:id/materials`);
      console.log(`   POST /api/projects/:id/analyses`);
      console.log(`   GET  /api/marketplace`);
      console.log(`   GET  /api/presets`);
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});