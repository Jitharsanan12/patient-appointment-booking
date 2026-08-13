/*
  React Context that tracks who is currently logged in and exposes
  login/register/logout functions. Wrapping the app in <AuthProvider>
  (see App.jsx) lets any component read the current user via useAuth().
*/

import { createContext, useContext, useEffect, useState } from "react";
import {
  getMe,
  getToken,
  setToken,
  clearToken,
  loginUser,
  registerUser,
} from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" is true while we check for an existing token on first load,
  // so we don't briefly flash a "logged out" screen before we know.
  const [loading, setLoading] = useState(true);

  // On first load, if a token is already saved in the browser (from a
  // previous visit), try to fetch the matching user so they stay logged in.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { access_token } = await loginUser(email, password);
    setToken(access_token);
    const currentUser = await getMe();
    setUser(currentUser);
    return currentUser;
  }

  async function register(data) {
    await registerUser(data);
    // Registration doesn't log the user in automatically; send them to log in.
    return login(data.email, data.password);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Convenience hook so components can just call useAuth() instead of
// importing useContext + AuthContext everywhere.
export function useAuth() {
  return useContext(AuthContext);
}
