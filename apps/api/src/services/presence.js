// Visiteurs par exposition (0 sans temps réel).
let counter = () => 0;

export function setVisitorCounter(fn) {
  counter = fn;
}

export const visitorsIn = (exhibitionId) => counter(exhibitionId);
