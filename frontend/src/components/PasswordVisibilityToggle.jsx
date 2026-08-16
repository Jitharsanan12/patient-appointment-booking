/*
  The small eye / eye-off button used by every password field in the app
  (Login, Register, Change Password, Reset Password, admin Create
  Doctor) to toggle that field between masked and plain-text display.

  Purely a rendering toggle — the caller owns the actual boolean state
  and flips its paired <input>'s type between "password" and "text";
  this component has no effect on the value itself, validation, or
  submission.
*/
export default function PasswordVisibilityToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      className="password-visibility-toggle"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {visible ? "visibility_off" : "visibility"}
      </span>
    </button>
  );
}
