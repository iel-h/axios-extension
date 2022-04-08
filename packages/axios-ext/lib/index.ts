import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import {
  buildFullPath,
  assignSafely,
  bind,
  extend,
  pick,
  serialize,
  isFunction,
  isPromise,
  isString
} from '@iel/axios-ext-utils'

declare module 'axios' {
  interface AxiosRequestConfig {
    [K: string]: any
  }
}

export type ProxyAxiosMethodNoData = 'delete' | 'get' | 'head' | 'options'
export type ProxyAxiosMethodWithData = 'post' | 'put' | 'patch'
export type ProxyAxiosMethod = ProxyAxiosMethodNoData | ProxyAxiosMethodWithData

export type ShallowAxiosInstance = AxiosInstance & { $eventStore: Record<string, any> }
export type ChainShallowAxiosInstance = Partial<ShallowAxiosInstance>
export type AxiosExtInstance = AxiosExt

export type AxiosExtPluginHook = {
  onRequest?: (
    $eventStore: ShallowAxiosInstance['$eventStore'],
    config: AxiosRequestConfig,
    setReturnValue: (value: any) => void,
    resolve: (value: any) => void,
    reject: (error: any) => void
  ) => void
  onResponse?: (
    $eventStore: ShallowAxiosInstance['$eventStore'],
    response: AxiosResponse,
    config: AxiosRequestConfig,
    setReturnValue: (value: any) => void,
    resolve: (value: any) => void,
    reject: (error: any) => void
  ) => void
  onResponseError?: (
    $eventStore: ShallowAxiosInstance['$eventStore'],
    error: any,
    config: AxiosRequestConfig,
    setReturnValue: (value: any) => void,
    resolve: (value: any) => void,
    reject: (error: any) => void
  ) => void
  onResponseFinally?: (
    $eventStore: ShallowAxiosInstance['$eventStore'],
    returnValue: any,
    config: AxiosRequestConfig
  ) => void
  onDestroy?: () => void
}
export type AxiosExtPlugin<T = any> = (axiosExt: AxiosExt, options?: T) => AxiosExtPluginHook

class AxiosExt {
  instance: AxiosInstance
  rawRequestFn: AxiosInstance['request']
  private plugins: Map<AxiosExtPlugin, AxiosExtPluginHook>

  constructor(instance: AxiosInstance) {
    if (!(instance instanceof axios.constructor)) {
      throw Error("The instance of parameter must be a Axios's instance.")
    }

    this.instance = instance
    this.rawRequestFn = instance.request
    this.plugins = new Map()

    this.init()
  }

  destroy() {
    this.plugins.forEach((hook) => isFunction(hook?.onDestroy) && hook!.onDestroy())
  }

  private init() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const axiosExt = this
    const instance = this.instance

    // 劫持 axios methods 方法
    const methodNoData: ProxyAxiosMethodNoData[] = ['delete', 'get', 'head', 'options']
    const methodWithData: ProxyAxiosMethodWithData[] = ['post', 'put', 'patch']

    const proxyRequest = function (withData = false): any {
      return function (this: ShallowAxiosInstance) {
        const $eventStore = this.$eventStore
        // eslint-disable-next-line prefer-const, prefer-rest-params
        let [configOrUrl, configOrData, config] = Array.from(arguments)

        if (withData) {
          config = assignSafely(config, { url: configOrUrl, data: configOrData })
        } else {
          if (isString(configOrUrl ?? '')) {
            config = assignSafely(config, { url: configOrUrl })
          } else {
            config = assignSafely(config, configOrUrl)
          }
        }

        return new Promise(async (resolve, reject) => {
          const wrapResolve: any = (value: any) => {
            if (wrapResolve.resolved) return
            wrapResolve.resolved = true

            setReturnValue(value)
            resolve(value)
          }

          let returnValue: any = null
          const setReturnValue = (value: any) => {
            returnValue = value
          }

          const getHookParams = (...params: any) =>
            ([] as any[]).concat($eventStore, params, config, setReturnValue, wrapResolve, reject)

          try {
            const onRequests = axiosExt.getHooks('onRequest')
            for (const onRequest of onRequests) {
              await onRequest(...getHookParams())

              // 如果设置 returnValue 为 Promise ，则提前返回数据并终止后续操作
              if (isPromise(returnValue)) {
                return wrapResolve(returnValue)
              }
            }

            const response = await axiosExt.rawRequestFn(config)

            setReturnValue(response)
            await axiosExt.runHooks('onResponse', ...getHookParams(response))
          } catch (error) {
            setReturnValue(Promise.reject(error))
            await axiosExt.runHooks('onResponseError', ...getHookParams(error))
          } finally {
            wrapResolve(returnValue)
            await axiosExt.runHooks('onResponseFinally', $eventStore, returnValue, config)
          }
        })
      }
    }

    methodNoData.forEach((method) => (instance[method] = proxyRequest(false)))
    methodWithData.forEach((method) => (instance[method] = proxyRequest(true)))

    // 更改 request 请求
    instance.request = proxyRequest(false) as any
  }

  private getHooks(name: keyof AxiosExtPluginHook) {
    return Array.from(this.plugins.values())
      .map((hook) => hook[name])
      .filter((hookFn) => isFunction(hookFn)) as ((...args: any) => any)[]
  }

  private runHooks(name: keyof AxiosExtPluginHook, ...args: any) {
    // eslint-disable-next-line prefer-spread
    return Promise.all(this.getHooks(name).map((fn) => fn.apply(null, args)))
  }

  createShallowAxiosInstance(thisArg: ChainShallowAxiosInstance = this.instance) {
    let shallowAxiosInstance: any = thisArg
    shallowAxiosInstance = bind(shallowAxiosInstance.request!, shallowAxiosInstance)
    shallowAxiosInstance.$eventStore = {}

    extend(shallowAxiosInstance, thisArg, shallowAxiosInstance)

    return shallowAxiosInstance as ShallowAxiosInstance
  }

  getFullPath(url: string) {
    return buildFullPath(this.instance.defaults.baseURL, url)
  }

  getKeyByConfig(config: AxiosRequestConfig = {}) {
    const { method, url, data = {}, params = {} } = config

    return serialize({ method, url: this.getFullPath(url || ''), data, params })
  }

  pickConfig(config: AxiosRequestConfig): Pick<AxiosRequestConfig, 'method' | 'url' | 'data' | 'params'> {
    return pick(config, ['method', 'url', 'data', 'params'])
  }

  use<T = any>(plugin: AxiosExtPlugin<T>, options?: T) {
    if (isFunction(plugin) && !this.plugins.has(plugin)) {
      this.plugins.set(plugin, plugin(this, options))
    }

    return this
  }

  eject(plugin: AxiosExtPlugin) {
    if (this.plugins.has(plugin)) {
      this.plugins.delete(plugin)
    }

    return this
  }
}

export default function useAxiosExt(instance: AxiosInstance) {
  return new AxiosExt(instance)
}
