import axios from "axios";
import { createApi } from "./api/generated";

const http = axios.create({
  baseURL: "http://localhost:8080",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

export const gatewayApi = createApi({ http, endpoint: "/graphql" });
