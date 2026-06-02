import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export interface User {
  id: string;
  username: string;
  homeId: string | null;
  avatar?: string;
  role: 'owner' | 'member';
}

const setupAxiosInterceptors = () => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
};
setupAxiosInterceptors();

export const auth = {
  login: async (username: string, password?: string): Promise<User> => {
    const res = await axios.post(`${API_URL}/auth/login`, { username, password });
    localStorage.setItem('auth_token', res.data.token);
    localStorage.setItem('current_user', JSON.stringify(res.data.user));
    setupAxiosInterceptors();
    window.dispatchEvent(new Event('auth_changed'));
    return res.data.user;
  },

  register: async (username: string, password?: string): Promise<User> => {
    const res = await axios.post(`${API_URL}/auth/register`, { username, password });
    localStorage.setItem('auth_token', res.data.token);
    localStorage.setItem('current_user', JSON.stringify(res.data.user));
    setupAxiosInterceptors();
    window.dispatchEvent(new Event('auth_changed'));
    return res.data.user;
  },
  
  kioskLogin: async (pin: string): Promise<User> => {
    const res = await axios.post(`${API_URL}/auth/kiosk-login`, { pin });
    localStorage.setItem('auth_token', res.data.token);
    localStorage.setItem('current_user', JSON.stringify(res.data.user));
    setupAxiosInterceptors();
    window.dispatchEvent(new Event('auth_changed'));
    return res.data.user;
  },

  verifyPin: async (pin: string): Promise<boolean> => {
    try {
      await axios.post(`${API_URL}/auth/verify-pin`, { pin });
      return true;
    } catch { 
      return false; 
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    setupAxiosInterceptors();
    window.dispatchEvent(new Event('auth_changed'));
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('current_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  refreshSession: async (): Promise<User | null> => {
    try {
        const res = await axios.get(`${API_URL}/auth/me`);
        localStorage.setItem('current_user', JSON.stringify(res.data));
        return res.data;
    } catch {
        auth.logout();
        return null;
    }
  },

  updateProfile: async (updates: { username: string, avatarUrl: string }) => {
    const res = await axios.put(`${API_URL}/auth/profile`, updates);
    localStorage.setItem('current_user', JSON.stringify(res.data));
    window.dispatchEvent(new Event('auth_changed'));
    return res.data;
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await axios.put(`${API_URL}/auth/password`, { oldPassword, newPassword });
      return true;
    } catch { return false; }
  },

  getUsersInHome: async (homeId: string): Promise<User[]> => {
    try {
      const res = await axios.get(`${API_URL}/homes/${homeId}/users`);
      return res.data;
    } catch { return []; }
  },

  inviteUserToHome: async (targetUsername: string, homeId: string): Promise<boolean> => {
    try {
      await axios.post(`${API_URL}/homes/${homeId}/invite`, { targetUsername });
      return true;
    } catch { return false; }
  },

  removeUserFromHome: async (userId: string): Promise<boolean> => {
    try {
      await axios.delete(`${API_URL}/homes/users/${userId}`);
      return true;
    } catch { return false; }
  },

  changeUserRole: async (userId: string, newRole: 'owner' | 'member'): Promise<boolean> => {
    try {
      await axios.put(`${API_URL}/homes/users/${userId}/role`, { role: newRole });
      
      const current = auth.getCurrentUser();
      if (current && current.id === userId) {
        current.role = newRole;
        localStorage.setItem('current_user', JSON.stringify(current));
        window.dispatchEvent(new Event('auth_changed'));
      }
      return true;
    } catch { return false; }
  }
};