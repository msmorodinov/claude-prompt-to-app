import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ToastContainer from './components/Toast'
import { ToastProvider } from './contexts/ToastContext'
import './styles/global.css'

const ChatPage = lazy(() => import('./pages/ChatPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Suspense fallback={<div className="app" />}>
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </ToastProvider>
    </BrowserRouter>
  )
}
