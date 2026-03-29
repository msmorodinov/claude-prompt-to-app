import ChatContainer from './components/ChatContainer'
import './styles/global.css'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Prompt-to-App</h1>
      </header>
      <main className="app-main">
        <ChatContainer />
      </main>
    </div>
  )
}
