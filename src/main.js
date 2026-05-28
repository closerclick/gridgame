import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@closerclick/closer-click-support'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
