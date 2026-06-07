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
  return (
    <div className="space-y-5">
      <Field
        label="输入页面 URL"
        hint="每行输入一个页面地址。系统会先创建页面任务，再自动抓取资源并生成下载任务。"
      >
        <TextArea
          className="min-h-[172px]"
          placeholder={"https://example.com/watch/1\nhttps://example.com/watch/2"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>

      <div className="ui-panel-muted rounded-[1.65rem] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4">
          <div className="max-w-2xl space-y-1.5">
            <p className="text-sm font-semibold text-stone-900">
              第 1 步：先创建页面任务
            </p>
            <p className="text-sm leading-6 text-stone-600">
              如果页面需要登录或手动播放，再到任务详情里打开浏览器继续抓取。
            </p>
          </div>
          <Button
            className="w-full sm:w-full"
            variant="primary"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? "创建中..." : "创建页面任务"}
          </Button>
        </div>
      </div>
    </div>
  );
}
