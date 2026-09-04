import axios from './axiosInstance.js';
import { isPlainObject } from '@/utils/judgmentUtils.js';

/**
 * 使用添加过默认配置的axios发请求，做了try-catch手机请求失败，请求失败返回null
 */
export const axiosRequest = {
  /**
   * 使用axios的get方法发送HTTP GET请求
   *
   * @param url 请求的URL
   * @param params 可选的请求参数对象，默认为空对象
   * @param config 可选的配置对象，默认为空对象
   * @returns Promise 返回axios的Promise对象，包含响应数据
   */
  async get(url, params = {}, config = {}) {
    if (!isPlainObject(config)) {
      config = {};
    }
    try {
      return await axios({
        method: 'GET',
        url: url,
        params,
        ...config,
      });
    } catch (err) {
      return err;
    }
  },

  /**
   * 使用axios发起POST请求
   *
   * @param url 请求的URL地址
   * @param data POST请求的数据，默认为空对象
   * @param config axios的配置选项，默认为空对象
   * @returns {Promise}，包含axios的响应数据
   */
  async post(url, data = {}, config = {}) {
    if (!isPlainObject(config)) {
      config = {};
    }
    try {
      return await axios({
        method: 'POST',
        url: url,
        data,
        ...config,
      });
    } catch (err) {
      return err;
    }
  },

  /**
   * 使用PUT方法发送请求
   *
   * @param url 请求的URL地址
   * @param data 请求携带的数据，默认为空对象
   * @param config 请求的配置信息，默认为空对象
   * @returns 返回axios.put的Promise对象
   */
  async put(url, data = {}, config = {}) {
    if (!isPlainObject(config)) {
      config = {};
    }
    try {
      return await axios({
        method: 'PUT',
        url,
        data,
        ...config,
      });
    } catch (err) {
      return err;
    }
  },

  /**
   * 发送一个DELETE请求到指定的URL
   *
   * @param {string} url - 请求的URL
   * @param {Object} data - 请求的查询参数，默认为空对象
   * @param {Object} config - 请求的配置选项，默认为空对象
   * @returns {Promise} - 返回一个Promise对象，解析后得到axios的响应数据
   */
  async delete(url, data = {}, config = {}) {
    if (!isPlainObject(config)) {
      config = {};
    }
    try {
      return await axios({
        method: 'DELETE',
        url: url,
        data,
        ...config,
      });
    } catch (err) {
      return err;
    }
  },
};
