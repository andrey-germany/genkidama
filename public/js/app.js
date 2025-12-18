// Initialize Swiper
const swiper = new Swiper('.main-swiper', {
  direction: 'horizontal',
  loop: false,
  speed: 600,
  mousewheel: {
    enabled: true,
    sensitivity: 1
  },
  keyboard: {
    enabled: true
  },
  pagination: {
    el: '.swiper-pagination',
    clickable: true,
    direction: 'vertical'
  },
  on: {
    slideChange: function() {
      // Add any slide change animations here
      document.body.setAttribute('data-slide', this.activeIndex);
    }
  }
});

// Touch/swipe is enabled by default in Swiper

// Calendar Modal
const modal = document.getElementById('calendar-modal');
const openCalendarBtn = document.getElementById('open-calendar');
const closeModalBtn = document.querySelector('.modal-close');

openCalendarBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  modal.classList.add('active');
  initCalendar();
});

closeModalBtn?.addEventListener('click', () => {
  modal.classList.remove('active');
});

modal?.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});

// Simple Calendar Implementation
let currentDate = new Date();
let selectedDate = null;

function initCalendar() {
  renderCalendar();
}

function renderCalendar() {
  const calendar = document.getElementById('calendar');
  if (!calendar) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startingDay = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  let html = `
    <div class="calendar-header" style="grid-column: 1 / -1; display: flex; justify-content: space-between; margin-bottom: 16px;">
      <button onclick="prevMonth()" style="background: none; border: none; cursor: pointer; font-size: 1.5rem;">←</button>
      <span style="font-size: 1.1rem; font-weight: 500;">${monthNames[month]} ${year}</span>
      <button onclick="nextMonth()" style="background: none; border: none; cursor: pointer; font-size: 1.5rem;">→</button>
    </div>
  `;

  // Day headers
  const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  dayNames.forEach(day => {
    html += `<div style="text-align: center; font-size: 0.75rem; color: #8A8A8A; padding: 8px 0;">${day}</div>`;
  });

  // Empty cells before first day
  for (let i = 0; i < startingDay; i++) {
    html += '<div></div>';
  }

  // Days
  const today = new Date();
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const isPast = date < today && date.toDateString() !== today.toDateString();
    const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();

    html += `
      <div class="calendar-day ${isPast ? 'unavailable' : ''} ${isSelected ? 'selected' : ''}"
           onclick="${isPast ? '' : `selectDate(${year}, ${month}, ${day})`}"
           style="${isPast ? 'color: #E5E5E5; cursor: not-allowed;' : ''}">
        ${day}
      </div>
    `;
  }

  calendar.innerHTML = html;
}

function prevMonth() {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
}

function selectDate(year, month, day) {
  selectedDate = new Date(year, month, day);
  document.getElementById('selected-date').value = selectedDate.toISOString().split('T')[0];
  renderCalendar();
  showTimeSlots();
}

function showTimeSlots() {
  // For now, show a simple time input
  const existingTimeSelect = document.getElementById('time-select-group');
  if (existingTimeSelect) return;

  const form = document.getElementById('booking-form');
  const firstFormGroup = form.querySelector('.form-group');

  const timeGroup = document.createElement('div');
  timeGroup.className = 'form-group';
  timeGroup.id = 'time-select-group';
  timeGroup.innerHTML = `
    <label for="time-select">Uhrzeit</label>
    <select id="time-select" name="start_time" required>
      <option value="">Bitte wählen...</option>
      <option value="09:00">09:00</option>
      <option value="10:00">10:00</option>
      <option value="11:00">11:00</option>
      <option value="12:00">12:00</option>
      <option value="13:00">13:00</option>
      <option value="14:00">14:00</option>
      <option value="15:00">15:00</option>
      <option value="16:00">16:00</option>
      <option value="17:00">17:00</option>
      <option value="18:00">18:00</option>
      <option value="19:00">19:00</option>
      <option value="20:00">20:00</option>
    </select>
  `;

  form.insertBefore(timeGroup, firstFormGroup);
}

// Booking form submission
document.getElementById('booking-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  // Get time from select
  const timeSelect = document.getElementById('time-select');
  if (timeSelect) {
    data.start_time = timeSelect.value;
  }

  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      alert('Ihre Anfrage wurde gesendet. Ivo wird sich bei Ihnen melden.');
      modal.classList.remove('active');
      e.target.reset();
    } else {
      alert('Es gab ein Problem. Bitte versuchen Sie es erneut.');
    }
  } catch (error) {
    console.error('Booking error:', error);
    alert('Verbindungsfehler. Bitte versuchen Sie es später erneut.');
  }
});

// Price card selection (visual feedback)
document.querySelectorAll('.price-card').forEach(card => {
  card.addEventListener('click', () => {
    const mode = card.dataset.mode;
    document.getElementById('pricing-mode').value = mode;

    // Visual feedback
    document.querySelectorAll('.price-card').forEach(c => c.style.borderColor = 'transparent');
    card.style.borderColor = '#D4A03E';
  });
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    swiper.slideNext();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    swiper.slidePrev();
  } else if (e.key === 'Escape' && modal.classList.contains('active')) {
    modal.classList.remove('active');
  }
});

// Make calendar navigation functions global
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.selectDate = selectDate;
