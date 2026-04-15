
import { useState } from "react";
import { useAuth } from '../../shared/auth/AuthContext';

export function LoginForm({ defaultUserId = "" }) {
  const { login } = useAuth();
  const [userId, setUserId] = useState(defaultUserId);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [connectedUser, setConnectedUser] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");

    try {
      const data = await login(userId, password);
      setConnectedUser(data.user?.id ?? userId);
      setStatus("success");
    } catch {
      setStatus("error");
      setConnectedUser("");
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card__brand">
          <div className="login-card__title">SynapseNote</div>
          <div className="login-card__sub">Sign in to continue</div>
        </div>
        <div className="login-card__fields">
          <label className="login-card__field">
            <span>User ID</span>
            <input
              aria-label="User ID"
              name="userId"
              onChange={(event) => setUserId(event.target.value)}
              type="text"
              value={userId}
            />
          </label>
          <label className="login-card__field">
            <span>Password</span>
            <input
              aria-label="Password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
        </div>
        <button className="login-card__submit" disabled={status === "submitting"} type="submit">
          {status === "submitting" ? "Signing In..." : "Sign In"}
        </button>
        {status === "success" ? <p className="login-card__status">Connected as {connectedUser}</p> : null}
        {status === "error" ? <p className="login-card__status login-card__status--error">Sign in failed</p> : null}
      </form>
    </div>
  );
}
