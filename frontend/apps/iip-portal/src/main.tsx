import React from 'react'
import ReactDOM from 'react-dom/client'
import { setupApiClient } from './api/client'
import { App } from './app/App'
import './index.css'
import 'sweetalert2/dist/sweetalert2.min.css'

setupApiClient()

const root = document.getElementById('root')!
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
