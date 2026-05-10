import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from 'vite-plugin-pwa'

import path from "path"

const root = path.resolve(__dirname, "src")
const publicDir = path.resolve(__dirname, "public")

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname),
  define: {
    // Polyfill process.env for Node.js libs used in browser (@zcomb/programs-sdk → beet → assert)
    "process.env": {},
    "process.browser": true,
  },
  resolve: {
    alias: {
      "@": path.resolve(root),
      shared: path.resolve(__dirname, "shared"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Spark-it',
        short_name: 'Spark-it',
        description: 'Make your idea become real',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // Set to 10 MB
        // Load the Web Push event handlers (push, notificationclick) into
        // the auto-generated SW. Keeping them in a separate /public file
        // means they persist across rebuilds and we avoid swapping the
        // SW bundle strategy to `injectManifest` (which would lose all
        // the `runtimeCaching` presets below).
        importScripts: ["push-handler.js"],
        // Use network-first strategy for HTML to always get latest version
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mainnet-beta\.solana\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'solana-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60, // 1 minute
              },
            },
          },
          {
            // Network-first for HTML files to always get latest version
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 0, // Always check network first
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            // Stale-while-revalidate for JS/CSS to balance performance and freshness
            urlPattern: ({ request }) => 
              request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
        // Skip waiting and claim clients immediately for faster updates
        skipWaiting: true,
        clientsClaim: true,
        // Clean up old caches
        cleanupOutdatedCaches: true,
        // Force update check on navigation
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        enabled: false, // Disable in dev to avoid issues
      },
    }),
  ],
  publicDir: publicDir,
  server: {
    // enable below to serve on local network (for testing on mobile devices)
    // host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true
      }
    }
  }
})
