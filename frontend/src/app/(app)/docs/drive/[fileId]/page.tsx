"use client";

// Drive's per-file route is now a thin redirect to the universal file
// detail route at /docs/files/drive_file/[id]. Old shared links keep
// working without breaking anyone's bookmarks.

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DriveFileLegacyRedirect() {
  const router = useRouter();
  const params = useParams<{ fileId: string }>();

  useEffect(() => {
    if (params.fileId) {
      router.replace(`/docs/files/drive_file/${params.fileId}`);
    }
  }, [params.fileId, router]);

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Redirecting…
    </div>
  );
}
