import { useEffect, useMemo, useRef, useState } from "react";

const fallbackLocations = [
  { label: "Amsterdam Centraal", lat: 52.3789, lng: 4.9003 },
  { label: "Schiphol Airport", lat: 52.3105, lng: 4.7683 },
  { label: "The Hague Central", lat: 52.08, lng: 4.324 },
  { label: "Rotterdam Central", lat: 51.9244, lng: 4.4699 },
  { label: "Utrecht Central", lat: 52.0894, lng: 5.1103 },
  { label: "Haarlem Centrum", lat: 52.3874, lng: 4.6462 },
  { label: "Leiden Central", lat: 52.1662, lng: 4.4818 },
  { label: "Almere Centrum", lat: 52.3508, lng: 5.2647 }
];

const vehicleLabels = {
  standard: "Standard taxi",
  station_wagon: "Station wagon",
  van: "Van up to 8"
};

function requiredVehicleForPassengers(passengers) {
  if (passengers <= 4) {
    return "standard";
  }
  if (passengers <= 6) {
    return "station_wagon";
  }
  return "van";
}

function toDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roundedFutureDate(hoursAhead) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const roundedMinutes = Math.ceil(date.getMinutes() / 15) * 15;
  date.setMinutes(roundedMinutes, 0, 0);
  return date;
}

function apiErrorMessage(payload, fallback) {
  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    return payload.detail.map((item) => item.msg).join(" ");
  }
  if (typeof payload.detail === "string") {
    return payload.detail;
  }
  return fallback;
}

function scrollToStep(element) {
  if (!element) {
    return;
  }

  requestAnimationFrame(() => {
    const topbar = document.querySelector(".topbar");
    const offset = topbar ? topbar.getBoundingClientRect().height + 16 : 16;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior: "smooth"
    });
  });
}

export default function App() {
  const [locations, setLocations] = useState(fallbackLocations);
  const [direction, setDirection] = useState("to_airport");
  const [pickupIndex, setPickupIndex] = useState(0);
  const [dropoffIndex, setDropoffIndex] = useState(1);
  const [pickupTime, setPickupTime] = useState(toDateTimeLocal(roundedFutureDate(4)));
  const [passengers, setPassengers] = useState(1);
  const [flightNumber, setFlightNumber] = useState("");
  const [quote, setQuote] = useState(null);
  const [booking, setBooking] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [customer, setCustomer] = useState({
    fullName: "",
    email: "",
    phone: "",
    notes: "",
    acceptsTerms: false
  });

  const quoteResultRef = useRef(null);
  const bookingSuccessRef = useRef(null);

  const pickup = locations[pickupIndex] || locations[0];
  const dropoff = locations[dropoffIndex] || locations[1];
  const vehicleType = useMemo(() => requiredVehicleForPassengers(passengers), [passengers]);
  const minPickupTime = useMemo(() => toDateTimeLocal(new Date(Date.now() + 185 * 60 * 1000)), []);

  useEffect(() => {
    async function loadLocations() {
      try {
        const response = await fetch("/locations");
        if (!response.ok) {
          throw new Error("Locations request failed");
        }

        const payload = await response.json();
        setLocations(payload);
      } catch {
        setLocations(fallbackLocations);
      }
    }

    loadLocations();
  }, []);

  useEffect(() => {
    const airportIndex = locations.findIndex((location) => location.label === "Schiphol Airport");
    const cityIndex = locations.findIndex((location) => location.label === "Amsterdam Centraal");

    if (direction === "from_airport") {
      setPickupIndex(airportIndex >= 0 ? airportIndex : 1);
      setDropoffIndex(cityIndex >= 0 ? cityIndex : 0);
    } else {
      setPickupIndex(cityIndex >= 0 ? cityIndex : 0);
      setDropoffIndex(airportIndex >= 0 ? airportIndex : 1);
    }
  }, [direction, locations]);

  function updateCustomer(field, value) {
    setCustomer((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function submitQuote(event) {
    event.preventDefault();
    setQuoteError("");
    setBookingError("");
    setQuote(null);
    setBooking(null);

    if (pickup.label === dropoff.label) {
      setQuoteError("Choose different pickup and drop-off locations.");
      return;
    }

    setIsQuoting(true);

    try {
      const response = await fetch("/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup,
          dropoff,
          pickup_time: new Date(pickupTime).toISOString(),
          passengers,
          vehicle_type: vehicleType,
          flight_number: flightNumber || null
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "Could not calculate the fare."));
      }

      setQuote(payload);
      setTimeout(() => scrollToStep(quoteResultRef.current), 30);
    } catch (error) {
      setQuoteError(error.message);
    } finally {
      setIsQuoting(false);
    }
  }

  async function submitBooking(event) {
    event.preventDefault();
    setBookingError("");

    if (!quote) {
      setBookingError("Calculate a fare before confirming the booking.");
      return;
    }

    setIsBooking(true);

    try {
      const response = await fetch("/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          customer: {
            full_name: customer.fullName,
            email: customer.email,
            phone: customer.phone
          },
          notes: customer.notes || null,
          accepts_terms: customer.acceptsTerms
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "Could not create the booking."));
      }

      setBooking(payload);
      setTimeout(() => scrollToStep(bookingSuccessRef.current), 30);
    } catch (error) {
      setBookingError(error.message);
    } finally {
      setIsBooking(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="AirportTaxi Demo home">
          <span className="brand-mark">AT</span>
          <span>
            <strong>AirportTaxi Demo</strong>
            <small>React + FastAPI booking</small>
          </span>
        </a>
        <nav className="top-actions" aria-label="Primary">
          <a className="call-link" href="tel:+31850653670">+31 85 065 3670</a>
        </nav>
      </header>

      <main>
        <section className="hero" aria-label="Airport taxi booking">
          <div className="hero-inner">
            <div className="booking-panel" aria-label="Taxi quote and booking form">
              <div className="panel-heading">
                <p className="eyebrow">Fixed fare airport transfer</p>
                <h1>Book your Schiphol taxi</h1>
              </div>

              <form className="quote-form" onSubmit={submitQuote}>
                <div className="segmented-control" role="tablist" aria-label="Trip direction">
                  <button
                    type="button"
                    className={`segment ${direction === "to_airport" ? "is-active" : ""}`}
                    onClick={() => setDirection("to_airport")}
                  >
                    To airport
                  </button>
                  <button
                    type="button"
                    className={`segment ${direction === "from_airport" ? "is-active" : ""}`}
                    onClick={() => setDirection("from_airport")}
                  >
                    From airport
                  </button>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>Pickup</span>
                    <select value={pickupIndex} onChange={(event) => setPickupIndex(Number(event.target.value))} required>
                      {locations.map((location, index) => (
                        <option key={location.label} value={index}>{location.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Drop-off</span>
                    <select value={dropoffIndex} onChange={(event) => setDropoffIndex(Number(event.target.value))} required>
                      {locations.map((location, index) => (
                        <option key={location.label} value={index}>{location.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Date and time</span>
                    <input
                      type="datetime-local"
                      min={minPickupTime}
                      value={pickupTime}
                      onChange={(event) => setPickupTime(event.target.value)}
                      required
                    />
                  </label>
                  <label className="field compact-field">
                    <span>Passengers</span>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={passengers}
                      onChange={(event) => setPassengers(Math.min(Math.max(Number(event.target.value) || 1, 1), 8))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Vehicle</span>
                    <select value={vehicleType} disabled>
                      <option value="standard">Standard taxi</option>
                      <option value="station_wagon">Station wagon</option>
                      <option value="van">Van up to 8</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Flight number</span>
                    <input
                      type="text"
                      maxLength="20"
                      placeholder="KL1234"
                      value={flightNumber}
                      onChange={(event) => setFlightNumber(event.target.value)}
                    />
                  </label>
                </div>

                <p className="form-message" role="alert">{quoteError}</p>
                <button className="primary-button" type="submit" disabled={isQuoting}>
                  {isQuoting ? "Calculating..." : "Calculate fixed fare"}
                </button>
              </form>

              {quote && (
                <section className="quote-result" ref={quoteResultRef} aria-live="polite">
                  <div>
                    <span className="result-label">Your fixed fare</span>
                    <strong>{quote.currency} {quote.total_price.toFixed(2)}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Distance</dt>
                      <dd>{quote.distance_km} km</dd>
                    </div>
                    <div>
                      <dt>Ride time</dt>
                      <dd>{quote.duration_minutes} min</dd>
                    </div>
                    <div>
                      <dt>Vehicle</dt>
                      <dd>{vehicleLabels[quote.vehicle_type]}</dd>
                    </div>
                  </dl>
                </section>
              )}

              {quote && (
                <form className="booking-form" onSubmit={submitBooking}>
                  <div className="field-grid">
                    <label className="field">
                      <span>Full name</span>
                      <input
                        type="text"
                        autoComplete="name"
                        value={customer.fullName}
                        onChange={(event) => updateCustomer("fullName", event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={customer.email}
                        onChange={(event) => updateCustomer("email", event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Mobile phone</span>
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={customer.phone}
                        onChange={(event) => updateCustomer("phone", event.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Notes</span>
                      <input
                        type="text"
                        maxLength="500"
                        placeholder="Extra luggage, child seat"
                        value={customer.notes}
                        onChange={(event) => updateCustomer("notes", event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="terms-row">
                    <input
                      type="checkbox"
                      checked={customer.acceptsTerms}
                      onChange={(event) => updateCustomer("acceptsTerms", event.target.checked)}
                      required
                    />
                    <span>I accept the booking terms and privacy policy.</span>
                  </label>

                  <p className="form-message" role="alert">{bookingError}</p>
                  <button className="primary-button secondary-tone" type="submit" disabled={isBooking}>
                    {isBooking ? "Confirming..." : "Confirm booking"}
                  </button>
                </form>
              )}

              {booking && (
                <section className="booking-success" ref={bookingSuccessRef} aria-live="polite">
                  <span className="success-kicker">Booking created</span>
                  <h2>{booking.ride_number}</h2>
                  <p>{booking.status.replace("_", " ")}</p>
                  <a href={booking.payment_url} target="_blank" rel="noreferrer">Open secure payment</a>
                </section>
              )}
            </div>

            <aside className="hero-copy" aria-label="Service summary">
              <p className="rating-line">Rated 4.7 from 3,000+ trips</p>
              <h2>Door-to-door airport rides with clear pricing.</h2>
              <div className="service-strip" aria-label="Service facts">
                <span>24/7 dispatch</span>
                <span>Online payment</span>
                <span>Flight-aware pickup</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="route-band" aria-label="Popular route prices">
          <div className="section-inner">
            <div className="section-title">
              <p className="eyebrow">Popular routes</p>
              <h2>Sample fixed fares for the demo</h2>
            </div>
            <div className="route-grid">
              <article className="route-card">
                <span>Amsterdam</span>
                <strong>from EUR 35</strong>
              </article>
              <article className="route-card">
                <span>Utrecht</span>
                <strong>from EUR 60</strong>
              </article>
              <article className="route-card">
                <span>The Hague</span>
                <strong>from EUR 70</strong>
              </article>
              <article className="route-card">
                <span>Rotterdam</span>
                <strong>from EUR 80</strong>
              </article>
            </div>
          </div>
        </section>

        <section className="operations-band" aria-label="Backend modules">
          <div className="section-inner operations-grid">
            <div>
              <p className="eyebrow">Backend demo</p>
              <h2>React frontend connected to FastAPI endpoints.</h2>
            </div>
            <ul className="module-list">
              <li>React state</li>
              <li>Vite proxy</li>
              <li>Quote API</li>
              <li>Booking API</li>
              <li>Python backend</li>
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}
