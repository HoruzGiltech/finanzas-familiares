import { createContext, useContext, useEffect, useState } from "react";

import { apiGet, apiPost } from "../lib/api.js";

const AuthContext = createContext(null);

// Guarda quién tiene la sesión iniciada y lo comparte con toda la aplicación.
export function AuthProvider({ children }) {
  // undefined = todavía no sabemos; null = sin sesión; objeto = usuario.
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    apiGet("/auth/me/")
      .then(({ ok, data }) => setUser(ok ? data : null))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await apiPost("/auth/logout/");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
