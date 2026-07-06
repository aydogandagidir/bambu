import { definePlugin, permissions } from '@core/plugin-sdk'

export default definePlugin({
  id: 'acme.template',
  name: 'Template Plugin',
  version: '1.0.0',
  description: 'Starter template demonstrating the Instatic plugin SDK — server lifecycle hooks, editor commands, and Command Spotlight (⌘K) integration.',
  permissions: [
    permissions.cmsRoutes,
    permissions.editorCode,
    permissions.editorCommands,
    permissions.editorToolbar
  ],
  entrypoints: {
    server: 'server/index.js',
    editor: 'editor/index.js'
  }
})
