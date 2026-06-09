import { Button } from "./ui/button";
import { Field, TextInput } from "./ui/field";

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
    <div>
      <Field label="输入页面 URL">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TextInput
            className="min-h-[56px] flex-1"
            placeholder="https://example.com/watch/1"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <Button
            className="w-full md:w-auto md:min-w-[168px]"
            variant="primary"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? "创建中..." : "创建页面任务"}
          </Button>
        </div>
      </Field>
    </div>
  );
}
