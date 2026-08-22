import {
    useEffect,
    useState,
  } from 'react';
  
  import {
    KeyRound,
 
    UserPlus,
    UsersRound,
  } from 'lucide-react';
  
  import {
    createUser,

    getRoles,
    getUsers,
    setUserPassword,
    updateUser,
  } from '../api/auth';
  
  import {
    Field,
    FormMessage,
    Modal,
    PageHeader,
    Panel,
  } from '../components/UI';
  
  
  const blankForm = {
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: '',
  };
  
  
  export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
  
    const [modalOpen, setModalOpen] =
      useState(false);
  
    const [form, setForm] =
      useState(blankForm);
  
    const [result, setResult] =
      useState(null);
  
    const [loading, setLoading] =
      useState(true);
  
      const [passwordModalOpen, setPasswordModalOpen] =
      useState(false);
    
    const [passwordUser, setPasswordUser] =
      useState(null);
    
    const [newPassword, setNewPassword] =
      useState('');
    
    const [passwordResult, setPasswordResult] =
      useState(null);
    const load = async () => {
      try {
        const [
          apiUsers,
          apiRoles,
        ] = await Promise.all([
          getUsers(),
          getRoles(),
        ]);
  
        setUsers(apiUsers);
        setRoles(apiRoles);
  
        
      } finally {
        setLoading(false);
      }
    };
  
  
    useEffect(() => {
      load().catch((error) => {
        console.error(
          'Failed to load users:',
          error,
        );
      });
    }, []);
  
  
    const submit = async (event) => {
      event.preventDefault();
  
      setResult(null);
      if (!form.role) {
        setResult({
          ok: false,
          message:
            'لطفاً سمت کاربر را انتخاب کنید.',
        });
      
        return;
      }
      try {
        await createUser({
          username:
            form.username.trim(),
  
          password:
            form.password,
  
          full_name:
            form.full_name.trim(),
  
          email:
            form.email.trim(),
  
          role:
            Number(form.role),
        });
  
        await load();
  
        setResult({
          ok: true,
          message:
            'کاربر با موفقیت ایجاد شد.',
        });
  
        setForm(blankForm);
  
        setTimeout(() => {
          setModalOpen(false);
          setResult(null);
        }, 700);
      } catch (error) {
        setResult({
          ok: false,
          message:
            error.message ||
            'ایجاد کاربر انجام نشد.',
        });
      }
    };
  
  
    const toggleActive = async (user) => {
      try {
        await updateUser(
          user.id,
          {
            is_active:
              !user.is_active,
          },
        );
  
        await load();
      } catch (error) {
        console.error(
          'Failed to update user:',
          error,
        );
      }
    };
  
    const openPasswordModal = (user) => {
        setPasswordUser(user);
        setNewPassword('');
        setPasswordResult(null);
        setPasswordModalOpen(true);
      };
      
      
      const submitPassword = async (event) => {
        event.preventDefault();
      
        if (newPassword.length < 8) {
          setPasswordResult({
            ok: false,
            message:
              'رمز عبور باید حداقل ۸ کاراکتر باشد.',
          });
      
          return;
        }
      
        try {
          await setUserPassword(
            passwordUser.id,
            newPassword,
          );
      
          setPasswordResult({
            ok: true,
            message:
              'رمز عبور با موفقیت تغییر کرد.',
          });
      
          setNewPassword('');
      
          setTimeout(() => {
            setPasswordModalOpen(false);
          }, 700);
        } catch (error) {
          setPasswordResult({
            ok: false,
            message:
              error.message ||
              'تغییر رمز عبور انجام نشد.',
          });
        }
      };
      
    return (
      <div className="page-stack">
        <PageHeader
          title="کاربران و دسترسی‌ها"
          subtitle="مدیریت حساب‌های کاربری و سمت سازمانی"
          actions={
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setResult(null);
  
                setForm(blankForm);
                setModalOpen(true);
              }}
            >
              <UserPlus size={17} />
              کاربر جدید
            </button>
          }
        />
  
        <Panel>
          {loading ? (
            <div>
              در حال دریافت کاربران...
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>نام</th>
                    <th>Username</th>
                    <th>ایمیل</th>
                    <th>سمت</th>
                    <th>وضعیت</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
  
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <UsersRound
                          size={16}
                        />{' '}
                        {user.full_name ||
                          '—'}
                      </td>
  
                      <td className="mono">
                        {user.username}
                      </td>
  
                      <td>
                        {user.email ||
                          '—'}
                      </td>
  
                      <td>
                        {user.role?.name ||
                          '—'}
                      </td>
  
                      <td>
                        {user.is_active
                          ? 'فعال'
                          : 'غیرفعال'}
                      </td>
  
                      <td>
                        <div
                            style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                            }}
                        >
                            <button
                            className="button ghost small"
                            type="button"
                            onClick={() =>
                                openPasswordModal(user)
                            }
                            >
                            <KeyRound size={15} />
                            تغییر رمز
                            </button>

                            <button
                            className="button ghost small"
                            type="button"
                            onClick={() =>
                                toggleActive(user)
                            }
                            >
                            {user.is_active
                                ? 'غیرفعال'
                                : 'فعال'}
                            </button>

                            
                        </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
  
        <Modal
          open={modalOpen}
          onClose={() =>
            setModalOpen(false)
          }
          title="ایجاد کاربر جدید"
          subtitle="نام کاربری، رمز عبور و سمت کاربر را مشخص کنید"
        >
          <form
            className="form-stack"
            onSubmit={submit}
          >
            <Field
              label="نام و نام خانوادگی"
              required
            >
              <input
                value={form.full_name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    full_name:
                      event.target.value,
                  })
                }
              />
            </Field>
  
            <Field
              label="Username"
              required
            >
              <input
                dir="ltr"
                value={form.username}
                onChange={(event) =>
                  setForm({
                    ...form,
                    username:
                      event.target.value,
                  })
                }
              />
            </Field>
  
            <Field
              label="Password"
              required
            >
              <input
                dir="ltr"
                type="password"
                minLength="8"
                value={form.password}
                onChange={(event) =>
                  setForm({
                    ...form,
                    password:
                      event.target.value,
                  })
                }
              />
            </Field>
  
            <Field
            label="ایمیل"
            required
            >
            <input
                dir="ltr"
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                setForm({
                    ...form,
                    email: event.target.value,
                })
                }
            />
            </Field>
  
            <Field
            label="سمت"
            required
            >
            <select
                required
                value={form.role}
                onChange={(event) =>
                setForm({
                    ...form,
                    role: event.target.value,
                })
                }
            >
                <option value="">
                انتخاب سمت
                </option>

                {roles.map((role) => (
                <option
                    key={role.id}
                    value={role.id}
                >
                    {role.name}
                </option>
                ))}
            </select>
            </Field>
  
            <FormMessage result={result} />
  
            <button
              className="button primary full"
              type="submit"
            >
              <UserPlus size={17} />
              ایجاد حساب کاربری
            </button>
          </form>
        </Modal>
        <Modal
  open={passwordModalOpen}
  onClose={() =>
    setPasswordModalOpen(false)
  }
  title="تغییر رمز عبور"
  subtitle={
    passwordUser
      ? `کاربر: ${
          passwordUser.full_name ||
          passwordUser.username
        }`
      : ''
  }
>
  <form
    className="form-stack"
    onSubmit={submitPassword}
  >
    <Field
      label="رمز عبور جدید"
      required
    >
      <input
        dir="ltr"
        type="password"
        minLength="8"
        value={newPassword}
        onChange={(event) =>
          setNewPassword(
            event.target.value
          )
        }
      />
    </Field>

    <FormMessage
      result={passwordResult}
    />

    <div className="modal-actions">
      <button
        className="button ghost"
        type="button"
        onClick={() =>
          setPasswordModalOpen(false)
        }
      >
        انصراف
      </button>

      <button
        className="button primary"
        type="submit"
      >
        <KeyRound size={16} />
        ذخیره رمز جدید
      </button>
    </div>
  </form>
</Modal>
      </div>
    );
  }