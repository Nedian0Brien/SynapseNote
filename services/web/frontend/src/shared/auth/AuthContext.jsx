/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    async function login(userId, password) {
        const response = await fetch('/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Login failed');
        }

        setCurrentUser(data.user ?? null);
        return data;
    }

    async function logout() {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
        setCurrentUser(null);
    }

    useEffect(() => {
        async function checkAuth() {
            try {
                const response = await fetch('/auth/me', { credentials: 'include' });
                if (response.ok) {
                    const data = await response.json();
                    setCurrentUser(data.user ?? null);
                } else {
                    setCurrentUser(null);
                }
            } catch {
                setCurrentUser(null);
            } finally {
                setLoading(false);
            }
        }
        checkAuth();
    }, []);

    const value = { currentUser, loading, login, logout };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
