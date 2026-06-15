import { parseTaskUrlInput } from "@video/shared";

import { Button } from "./ui/button";
import { Field, TextArea } from "./ui/field";

export function TaskComposer({
  value,
  busy,
  onChange,
  onSubmit
}: {
  value: string;
  busy: boolean;
  onChange(value: string): void;
  onSubmit(): void;
}) {
  const parsedUrlCount = parseTaskUrlInput(value).length;

  return (
    <div>
      <Field
        label="输入页面 URL"
        hint="支持一次粘贴多个链接，按换行、空格或逗号分隔都可以。"
      >
        <div className="flex flex-col gap-3">
          <TextArea
            className="min-h-[112px] resize-y"
            placeholder={
              "https://example.com/watch/1\nhttps://example.com/watch/2"
            }
            rows={4}
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <p className="text-[13px] leading-6 text-stone-600">
              {parsedUrlCount > 0
                ? `已识别 ${parsedUrlCount} 条链接，可直接创建批量页面任务。`
                : "粘贴后会自动识别有效链接，Cmd/Ctrl + Enter 可以直接提交。"}
            </p>
            <Button
              className="w-full md:w-auto md:min-w-[168px]"
              variant="primary"
              onClick={onSubmit}
              disabled={busy}
            >
              {busy ? "创建中..." : "创建页面任务"}
            </Button>
          </div>
        </div>
      </Field>
    </div>
  );
}
