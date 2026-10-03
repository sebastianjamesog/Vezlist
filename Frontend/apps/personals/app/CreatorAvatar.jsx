import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * A creator's avatar — round unless `rounded` says otherwise. Most accounts have no photo yet (profile-photo
 * upload is future work), so the fallback is their initials on the brand
 * gradient rather than an empty circle.
 */
export default function CreatorAvatar({
  name,
  src,
  size = 40,
  rounded = "rounded-full",
  discreet = false,
  className = "",
}) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <MediaImage
          discreet={discreet}
          fill
          src={src}
          alt=""
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="brand-gradient grid size-full place-items-center font-bold text-on-brand"
          style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
