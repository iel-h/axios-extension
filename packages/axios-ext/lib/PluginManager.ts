import { isFunction } from '@iel/axios-ext-utils'
import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AxiosExtInstance } from './AxiosExt'
import { EventStoreType } from './helper'

export type AxiosExtPlugin<T = any> = (axiosExt: AxiosExtInstance, options: T) => void

type HookCommonParams = {
  $eventStore: EventStoreType
  config: AxiosRequestConfig
  returnValue: any
  setReturnValue: (value: any) => void
  resolve: (value: any) => void
  reject: (error: any) => void
}

type AxiosRequestFnType = AxiosInstance['request']

export type AxiosExtPluginOnRequestHook = (
  params: {
    requestFn: AxiosRequestFnType
    setRequestFn: (fn: any) => void
  } & HookCommonParams
) => void

export type AxiosExtPluginOnResponseHook = (params: { response: AxiosResponse } & HookCommonParams) => void

export type AxiosExtPluginOnResponseErrorHook = (params: { error: AxiosError } & HookCommonParams) => void

export type AxiosExtPluginOnFinallyHook = (
  params: { isError: boolean } & Pick<HookCommonParams, '$eventStore' | 'config' | 'returnValue'>
) => void

export type AxiosExtPluginOnDestroyHook = () => void

export type AxiosExtPluginHooks = {
  onRequest: AxiosExtPluginOnRequestHook[]
  onResponse: AxiosExtPluginOnResponseHook[]
  onResponseError: AxiosExtPluginOnResponseErrorHook[]
  onFinally: AxiosExtPluginOnFinallyHook[]
  onDestroy: AxiosExtPluginOnDestroyHook[]
}

export type AxiosExtPluginManagerInstance = AxiosExtPluginManager

const createHooks = () => ({
  onRequest: [],
  onResponse: [],
  onResponseError: [],
  onFinally: [],
  onDestroy: []
})

export default class AxiosExtPluginManager {
  plugins: Map<AxiosExtPlugin, AxiosExtPluginHooks>

  constructor() {
    this.plugins = new Map()
  }

  has(plugin: AxiosExtPlugin) {
    return this.plugins.has(plugin)
  }

  set(plugin: AxiosExtPlugin) {
    if (this.has(plugin)) {
      return this.plugins
    }
    return this.plugins.set(plugin, createHooks())
  }

  get(plugin: AxiosExtPlugin) {
    return this.plugins.get(plugin)
  }

  delete(plugin: AxiosExtPlugin) {
    return this.plugins.delete(plugin)
  }

  clear() {
    this.plugins.clear()
  }

  appendHookFn(plugin: AxiosExtPlugin, name: keyof AxiosExtPluginHooks, callback: any) {
    if (!isFunction(callback)) return false

    const pluginHooks = this.plugins.get(plugin)
    if (!pluginHooks || !pluginHooks[name]) return false

    pluginHooks[name].push(callback)
  }

  getHooks(name: keyof AxiosExtPluginHooks) {
    let hooks: any[] = []
    this.plugins.forEach((_hooks) => {
      hooks = hooks.concat(_hooks[name] || [])
    })
    return hooks as AxiosExtPluginHooks[typeof name]
  }

  runHooks(name: keyof AxiosExtPluginHooks, ...args: any[]) {
    this.getHooks(name).forEach((fn: (...args: any) => any) => fn(...args))
  }
}
