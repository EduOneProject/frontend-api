import axios from 'axios'
import {createApi} from './api/generated'

const http = axios.create({
    baseURL: '/api',
    timeout: 15_000,
    headers: {'Content-Type': 'application/json'},
})

export const api = createApi({http, endpoint: '/graphql'})