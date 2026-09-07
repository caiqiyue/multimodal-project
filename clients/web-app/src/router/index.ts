import { createRouter, createWebHistory } from 'vue-router';
import { getAccessToken } from '@/lib/tokenStorage';
import LoginView from '@/views/LoginView.vue';
import ChatView from '@/views/ChatView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/chat', component: ChatView },
    { path: '/', redirect: '/chat' },
  ],
});

router.beforeEach((to) => {
  const token = getAccessToken();
  if (to.path !== '/login' && !token) return { path: '/login' };
  if (to.path === '/login' && token) return { path: '/chat' };
  return true;
});