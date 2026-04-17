import axios from 'axios'
import type { AxiosInstance } from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${import.meta.env.VITE_BACKEND_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
})
