import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { useAuthStore } from './stores/authStore'
import './index.css'

void useAuthStore.persist.rehydrate()

const root = document.getElementById('root')!
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
