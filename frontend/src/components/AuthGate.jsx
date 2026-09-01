import { useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import {
  Field,
  FormMessage,
  Panel,
} from './UI';


export default function AuthGate({ children }) {
  const {
    authenticated,
    loading,
    login,
  } = useAuth();

  const [form, setForm] = useState({
    username: '',
    password: '',
  });

  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    setSubmitting(true);
    setResult(null);

    try {
      await login(
        form.username.trim(),
        form.password,
      );
    } catch (error) {
        const loginMessage =
        error.message?.includes(
          'Unable to log in'
        )
          ? 'نام کاربری یا رمز عبور اشتباه است.'
          : error.message;
      
      setResult({
        ok: false,
        message:
          loginMessage ||
          'ورود به سیستم انجام نشد.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '80px',
          textAlign: 'center',
        }}
      >
        در حال بررسی نشست کاربر...
      </div>
    );
  }

  if (authenticated) {
    return children;
  }

  return (
    <div
      className="page-stack"
      style={{
        maxWidth: '460px',
        margin: '80px auto',
        padding: '24px',
      }}
    >
      <Panel
        title="ورود به سیستم"
        subtitle="NEXUS ERP"
      >
        <form
          onSubmit={submit}
          className="form-stack"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <KeyRound size={32} />
          </div>

          <Field
            label="نام کاربری"
            required
          >
            <input
              value={form.username}
              autoComplete="username"
              onChange={(event) =>
                setForm({
                  ...form,
                  username: event.target.value,
                })
              }
            />
          </Field>

          <Field
            label="رمز عبور"
            required
          >
            <input
              type="password"
              value={form.password}
              autoComplete="current-password"
              onChange={(event) =>
                setForm({
                  ...form,
                  password: event.target.value,
                })
              }
            />
          </Field>

          <FormMessage result={result} />

          <button
            className="button primary full"
            type="submit"
            disabled={submitting}
          >
            <LogIn size={17} />

            {submitting
              ? 'در حال ورود...'
              : 'ورود'}
          </button>
        </form>
      </Panel>
    </div>
  );
}