import { QueryClient } from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet
} from '@tanstack/react-router'
import App from './App'
import { AboutRoute } from './routes/AboutRoute'
import { ConversationRoute } from './routes/ConversationRoute'

type RouterContext = {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutRoute
})

const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversation/$conversationId',
  component: ConversationRoute
})

const routeTree = rootRoute.addChildren([homeRoute, aboutRoute, conversationRoute])

export const createAppRouter = (queryClient: QueryClient): ReturnType<typeof createRouter> =>
  createRouter({
    routeTree,
    context: {
      queryClient
    },
    history: createHashHistory()
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
