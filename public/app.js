/**
 * Logbook — Landing Page Application Script
 * Vanilla JavaScript implementation
 */

document.addEventListener('DOMContentLoaded', () => {
  initWaitlistForm();
});

/**
 * Waitlist Form Controller
 * Manages email validation, submission to /api/waitlist, loading, success, and error states.
 */
function initWaitlistForm() {
  const form = document.getElementById('waitlist-form');
  const emailInput = document.getElementById('waitlist-email');
  const submitBtn = document.getElementById('waitlist-submit');
  const feedbackEl = document.getElementById('waitlist-feedback');

  if (!form || !emailInput || !submitBtn || !feedbackEl) return;

  const btnText = submitBtn.querySelector('.button-label');
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setFeedback(message, type) {
    feedbackEl.textContent = message;
    feedbackEl.className = 'waitlist-feedback';
    if (type === 'error') {
      feedbackEl.classList.add('feedback-error');
      emailInput.setAttribute('aria-invalid', 'true');
    } else if (type === 'success') {
      feedbackEl.classList.add('feedback-success');
      emailInput.removeAttribute('aria-invalid');
    } else {
      emailInput.removeAttribute('aria-invalid');
    }
  }

  function clearFeedback() {
    feedbackEl.textContent = '';
    feedbackEl.className = 'waitlist-feedback';
    emailInput.removeAttribute('aria-invalid');
  }

  // Clear errors as soon as the user starts typing
  emailInput.addEventListener('input', () => {
    if (feedbackEl.classList.contains('feedback-error')) {
      clearFeedback();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim().toLowerCase();

    // 1. Empty State Validation
    if (!email) {
      setFeedback('Please enter your email to join the waitlist.', 'error');
      emailInput.focus();
      return;
    }

    // 2. Invalid Email Format Validation
    if (!EMAIL_REGEX.test(email)) {
      setFeedback('Please enter a valid email address (e.g. name@example.com).', 'error');
      emailInput.focus();
      return;
    }

    // 3. Loading State
    clearFeedback();
    emailInput.disabled = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    if (btnText) btnText.textContent = 'Securing spot...';

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        // 4. Success State
        setFeedback(
          data.message || "You're on the list. We'll let you know when it's ready.",
          'success'
        );
        emailInput.value = '';
        if (btnText) btnText.textContent = 'Registered';
        submitBtn.classList.remove('is-loading');

        setTimeout(() => {
          emailInput.disabled = false;
          submitBtn.disabled = false;
          if (btnText) btnText.textContent = 'Join the waitlist';
        }, 5000);
      } else {
        // 5. Error State (from server)
        const errMsg = data.error || 'Unable to join waitlist. Please try again.';
        setFeedback(errMsg, 'error');
        emailInput.disabled = false;
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        if (btnText) btnText.textContent = 'Join the waitlist';
        emailInput.focus();
      }
    } catch (err) {
      console.error('Waitlist submission failed:', err);
      setFeedback('Network connection error. Please try again.', 'error');
      emailInput.disabled = false;
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      if (btnText) btnText.textContent = 'Join the waitlist';
      emailInput.focus();
    }
  });
}
