/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare module 'virtual:spark-components' {
  type RegisterFn = {
  (app: import('vue').App): { total: number; sync: number; async: number }}
  export const registerComponents: RegisterFn
}