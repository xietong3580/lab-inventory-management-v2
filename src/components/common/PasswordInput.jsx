import { useState } from 'react';

/**
 * 密码输入框组件，带"小眼睛"显示/隐藏切换
 *
 * 默认隐藏密码（type=password），点击眼睛图标切换为明文（type=text），
 * 再点击恢复隐藏。
 *
 * Props 通过 className/placeholder/... 透传给底层 <input>。
 */
function PasswordInput({
  className = '',
  placeholder = '请输入密码',
  id,
  name,
  value,
  onChange,
  required,
  autoComplete,
  autoFocus,
  minLength,
  disabled,
  ...rest
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full pr-10 ${className}`}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={minLength}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 focus:outline-none"
        title={visible ? '隐藏密码' : '显示密码'}
        aria-label={visible ? '隐藏密码' : '显示密码'}
      >
        {visible ? (
          /* 眼睛张开 — 点击隐藏 */
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.453 10.066 7.453.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.547c4.756 0 8.773 3.115 10.066 7.453a10.46 10.46 0 01-1.516 2.636m-5.297-5.297a3.182 3.182 0 00-4.5 4.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ) : (
          /* 眼睛闭合 — 点击显示 */
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.577 3.01 9.964 7.178.05.209.05.435 0 .644-1.387 4.167-5.326 7.178-9.964 7.178-4.638 0-8.577-3.01-9.964-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default PasswordInput;
