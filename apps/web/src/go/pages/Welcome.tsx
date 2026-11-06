import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo, Button } from '../../ui';
import { OnboardingScene } from '../../assets/illustrations';
import { cx } from '../../lib/format';

const STEPS = [
  { h: ['Find. Charge.', 'Manage.'], sub: 'Your EV charging partner across the Philippines', big: ['EV power,', 'everywhere.'], body: 'Discover how AChargeX makes charging simple and hassle-free.' },
  { h: ['Find chargers', 'near you.'], sub: 'Live availability, connectors and prices', big: ['Every station,', 'one map.'], body: 'Filter by your car’s connector, charging speed and price per kWh.' },
  { h: ['Scan to', 'start.'], sub: 'Every AChargeX charger has a QR label', big: ['Point, scan,', 'plug in.'], body: 'Scanning only opens the charger — nothing starts until you confirm.' },
  { h: ['Charge with', 'a limit.'], sub: 'Choose ₱200, ₱500 or Full', big: ['You stay', 'in control.'], body: 'Charging stops automatically when your spending limit is reached.' },
  { h: ['Pay only for', 'what you use.'], sub: 'GCash, Maya and cards when available', big: ['Clear receipts,', 'every time.'], body: 'Unused holds are released after your session ends.' },
];

export function markOnboarded() {
  try {
    localStorage.setItem('ax.onboarded', '1');
  } catch {
    /* ignore */
  }
}
export function isOnboarded() {
  try {
    return localStorage.getItem('ax.onboarded') === '1';
  } catch {
    return true;
  }
}

export default function Welcome() {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const step = STEPS[i];
  const finish = () => {
    markOnboarded();
    nav('/signin');
  };
  return (
    <div className="flex min-h-dvh justify-center bg-white">
      <div className="flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-7 pt-safe">
        <div className="flex h-14 items-center justify-between">
          <span className="w-14" />
          <Logo />
          <button type="button" onClick={finish} className="w-14 py-3 text-right text-[13px] font-bold tracking-[1px] text-ax-green-text">
            SKIP
          </button>
        </div>

        <h1 className="mt-5 text-center text-[clamp(28px,8.5vw,34px)] font-extrabold leading-[1.1] tracking-[-1px]">
          {step.h[0]}
          <br />
          <span className="text-ax-green-text">{step.h[1]}</span>
        </h1>
        <p className="mt-2.5 text-center text-[15px] font-medium text-ax-muted">{step.sub}</p>

        <div className="relative mt-6 flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-[28px] bg-ax-navy">
          <OnboardingScene step={i} />
          <div className={cx('flex flex-col items-center gap-4', i === 0 ? 'relative -mt-10' : 'absolute inset-x-0 bottom-6')}>
            {i === 0 && (
              <svg role="img" aria-label="Charging bolt" width="72" height="88" viewBox="0 0 24 30">
                <path d="M14 1 3 17h8l-2 12 12-17h-8z" fill="#00BF80" />
              </svg>
            )}
            <div className="text-center text-[26px] font-extrabold leading-[1.15] tracking-[-0.5px] text-white">
              {step.big[0]}
              <br />
              <span className="text-ax-navy-sub">{step.big[1]}</span>
            </div>
          </div>
        </div>

        <p className="mx-3 mt-6 text-center text-[15px] leading-relaxed text-ax-muted">{step.body}</p>

        <div className="my-5 flex justify-center gap-2" role="tablist" aria-label="Onboarding steps">
          {STEPS.map((_, k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={`Step ${k + 1}`}
              onClick={() => setI(k)}
              className={cx('h-2 rounded-full transition-all', k === i ? 'w-[22px] bg-ax-green-text' : 'w-2 bg-[#D5DFE7]')}
            />
          ))}
        </div>

        <Button size="lg" block onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())}>
          {i < STEPS.length - 1 ? 'Next' : 'Get started'}
        </Button>
        <Link to="/signin" onClick={markOnboarded} className="mt-3 text-center text-[13px] font-semibold text-ax-muted hover:text-ax-navy">
          I already have an account
        </Link>
      </div>
    </div>
  );
}
