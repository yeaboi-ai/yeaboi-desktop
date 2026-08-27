// The duck as the pet window draws him: the same layer stack as
// public/pet/index.html, in the same order.
//
// The base sprite alone is not the duck — it is rough under the wing and the
// sunglasses, because those layers always cover it. Drawing it on its own
// shows the mess.

const LAYERS = [
  { src: '/pet/assets/duck-foot-back.png', key: 'foot-back' },
  { src: '/pet/assets/duck-foot-front.png', key: 'foot-front' },
  { src: '/pet/assets/duck-wing.png', key: 'wing' },
  { src: '/pet/assets/duck-glasses.png', key: 'glasses' },
];

export function DuckSprite({ width, filter }: { width: number; filter: string }) {
  return (
    <div className="relative shrink-0" style={{ width, filter }} aria-hidden="true">
      {/* The base is in flow, so it gives the stack its height; every other
          layer is a full-canvas overlay pinned to the same box. */}
      <img src="/pet/assets/duck-body.png" alt="" className="block h-auto w-full" />
      {LAYERS.map((layer) => (
        <img
          key={layer.key}
          src={layer.src}
          alt=""
          className="absolute top-0 left-0 block h-auto w-full"
        />
      ))}
    </div>
  );
}
