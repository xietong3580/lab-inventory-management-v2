import { useState } from 'react';

// 常见问题折叠条目
function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {question}
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="px-3 py-2.5 text-sm text-slate-600 border-t border-slate-100 bg-slate-50 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

// 步骤条目
function StepItem({ number, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-600 text-white text-xs font-semibold shrink-0 mt-0.5">
        {number}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 mb-1">{title}</div>
        <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// 示意图占位卡
function PlaceholderDiagram({ label }) {
  return (
    <div className="my-2 p-4 border border-dashed border-slate-300 rounded-md bg-slate-50 text-center">
      <div className="text-slate-400 text-2xl mb-1">🖼️</div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xs text-slate-350">（示意图区域，后续可替换为真实页面截图）</div>
    </div>
  );
}

export default function SystemOperationGuide({ embedded = false }) {
  const Wrapper = embedded ? 'div' : 'div';
  const wrapperClass = embedded ? '' : 'bg-white border border-slate-200 rounded-lg';

  return (
    <div className={wrapperClass}>
      {!embedded && (
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">库存系统功能介绍与使用说明</h2>
          <p className="text-sm text-slate-500 mt-1">
            面向零基础人员，介绍系统各模块功能及日常操作步骤。
          </p>
        </div>
      )}

      <div className="p-4 md:p-6 space-y-8">
        {/* ══════════════════════════════════════════ */}
        {/* 第一部分：功能介绍 */}
        {/* ══════════════════════════════════════════ */}
        <div>
          <div className="text-base font-semibold text-slate-800 mb-4 border-l-4 border-slate-500 pl-2.5">
            功能介绍
          </div>
          <div className="text-sm text-slate-600 mb-4">
            以下介绍系统各主要模块的作用，帮助您了解每个菜单是干什么的。
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                icon: '📦',
                title: '产品管理',
                desc: '维护产品基础资料，包括产品名称、SKU 编码、库存分类、当前库存、库位、品牌、规格、供应商、采购价和售价等信息。支持搜索、筛选、新增、编辑、删除和库存台账查看。',
                role: '管理员可编辑，查看人员可查看',
              },
              {
                icon: '↔️',
                title: '出入库记录',
                desc: '记录产品的入库和出库操作。每次出入库会自动更新产品库存、生成台账记录和审计日志。支持撤销错误操作。',
                role: '管理员可操作，查看人员可查看',
              },
              {
                icon: '📊',
                title: '仪表盘',
                desc: '展示系统关键数据概览：产品总数、库存状态分布、近期出入库趋势、低库存产品数量等，帮助快速了解库存整体状况。',
                role: '所有用户可查看',
              },
              {
                icon: '⚠️',
                title: '低库存预警',
                desc: '展示当前库存低于或等于最低库存标准的产品列表，帮助及时补货，避免断货。',
                role: '所有用户可查看',
              },
              {
                icon: '📋',
                title: '操作日志',
                desc: '记录系统中所有管理员的关键操作：新增产品、编辑产品、出入库、撤销交易、创建备份、恢复准备等。出问题时优先查看操作日志，可追溯是谁在什么时候做了什么。',
                role: '所有用户可查看',
              },
              {
                icon: '⚙️',
                title: '系统设置',
                desc: '管理系统配置，包括：数据安全检查、数据库备份创建、备份恢复预检、正式启用前检查等维护功能。也包含账号安全（修改密码）和系统信息。',
                role: '管理员可操作，查看人员仅可查看',
              },
              {
                icon: '📥',
                title: '导入预览',
                desc: '辅助检查 CSV 文件中的产品数据，预览导入结果。不直接修改数据库，仅作为核对和检查工具。',
                role: '管理员可操作',
              },
              {
                icon: '💡',
                title: '使用说明',
                desc: '本页面。面向零基础人员提供图文操作指导，帮助快速了解系统功能和日常操作步骤。',
                role: '所有用户可查看',
              },
            ].map(mod => (
              <div key={mod.title} className="p-3.5 border border-slate-200 rounded-md hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{mod.icon}</span>
                  <span className="text-sm font-semibold text-slate-800">{mod.title}</span>
                </div>
                <div className="text-xs text-slate-600 mb-2 leading-relaxed">{mod.desc}</div>
                <div className="text-xs text-slate-400">{mod.role}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          {/* ══════════════════════════════════════════ */}
          {/* 第二部分：使用说明 */}
          {/* ══════════════════════════════════════════ */}
          <div className="text-base font-semibold text-slate-800 mb-4 border-l-4 border-slate-500 pl-2.5">
            使用说明
          </div>
          <div className="text-sm text-slate-600 mb-5">
            以下按日常使用场景，分步骤说明每个操作的流程。
          </div>

          {/* 场景 1：查询产品 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：查询产品库存</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="打开产品管理">
                登录系统后，在左侧导航栏点击「产品管理」。
              </StepItem>
              <StepItem number={2} title="搜索产品">
                在搜索框输入产品名称或 SKU 编码，按回车键搜索。也可使用品牌、库存分类、库位等下拉筛选。
              </StepItem>
              <StepItem number={3} title="查看详情">
                表格中显示产品的 SKU、名称、分类、库存、最低库存、状态和库位。低库存产品以橙色标识，正常产品以绿色标识。
              </StepItem>
            </div>
          </div>

          {/* 场景 2：新增产品 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：新增产品</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="打开新增弹窗">
                在产品管理页面左上角点击「+ 新增产品」。
              </StepItem>
              <StepItem number={2} title="填写产品信息">
                必填：<strong>SKU 编码</strong>（唯一标识）、<strong>产品名称</strong>、<strong>库存分类</strong>、<strong>单位</strong>、<strong>当前库存</strong>、<strong>库位</strong>。<br />
                选填：品牌、规格、供应商、备注、采购价、售价。
              </StepItem>
              <StepItem number={3} title="保存">
                单条录入点击「添加产品」。<strong>连续录入时点击「保存并继续新增」</strong>，弹窗不关闭且保留分类、单位、库位，提高效率。
              </StepItem>
            </div>
            <PlaceholderDiagram label="新增产品弹窗示意：①产品名称 ②SKU ③库存分类和库位 ④保存并继续新增" />
          </div>

          {/* 场景 3：编辑产品 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：编辑产品信息</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="找到目标产品">
                搜索或筛选到要修改的产品，点击其右侧的「编辑」按钮。
              </StepItem>
              <StepItem number={2} title="修改并保存">
                修改信息后点击「更新产品」。编辑不会影响已有的出入库记录和台账。
              </StepItem>
            </div>
          </div>

          {/* 场景 4：入库 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：录入入库</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="打开出入库记录页面">
                在左侧导航栏点击「出入库记录」。
              </StepItem>
              <StepItem number={2} title="填写入库信息">
                选择或搜索产品 → 类型选择「入库」→ 填写入库数量 → 填写备注（如供应商、入库单号）→ 保存。
              </StepItem>
              <StepItem number={3} title="确认结果">
                保存后产品库存自动增加，台账和审计日志同步记录。
              </StepItem>
            </div>
          </div>

          {/* 场景 5：出库 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：录入出库</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="选择产品和类型">
                在出入库记录页面选择产品，类型选择「出库」。
              </StepItem>
              <StepItem number={2} title="填写数量和备注">
                填写出库数量（不能超过当前库存），填写备注（如领用人、用途）后保存。
              </StepItem>
              <StepItem number={3} title="确认结果">
                保存后产品库存自动减少，台账和审计日志同步记录。
              </StepItem>
            </div>
            <PlaceholderDiagram label="出入库表单示意：选择产品 → 选择类型 → 填写数量 → 填写备注 → 保存" />
          </div>

          {/* 场景 6：撤销 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：撤销错误出入库记录</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="找到要撤销的记录">
                在出入库记录列表中找到错误的记录。
              </StepItem>
              <StepItem number={2} title="点击撤销">
                点击该记录旁的「撤销」按钮。撤销后库存恢复为操作前的数量，台账标记为"已撤销"。
              </StepItem>
            </div>
          </div>

          {/* 场景 7：低库存 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：查看低库存产品</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="打开低库存预警">
                在左侧导航栏点击「低库存预警」。
              </StepItem>
              <StepItem number={2} title="查看和处理">
                页面列出所有库存不足的产品，可按需进行补货出库。
              </StepItem>
            </div>
          </div>

          {/* 场景 8：导出 CSV */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：导出 CSV 核对</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="在产品管理页面筛选">
                先筛选需要导出的产品范围（如按库存分类或库位）。
              </StepItem>
              <StepItem number={2} title="点击导出">
                点击右上角「导出 CSV」按钮，系统会先进行安全检查，确认后即可下载 CSV 文件。
              </StepItem>
              <StepItem number={3} title="用它文件核对">
                用 Excel 打开导出的 CSV，与原始数据来源逐条比对确认。
              </StepItem>
            </div>
          </div>

          {/* 场景 9：创建备份 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：创建数据库备份</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="打开系统设置">
                在左侧导航栏点击「系统设置」。
              </StepItem>
              <StepItem number={2} title="找到备份区域">
                在系统维护卡片中找到「创建数据库备份」按钮，点击确认即可。
              </StepItem>
              <StepItem number={3} title="建议时机">
                每批产品录入完成后、重要操作前、每天收工时都可以创建备份。
              </StepItem>
            </div>
          </div>

          {/* 场景 10：查看操作日志 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-2">场景：查看操作日志</div>
            <div className="space-y-2 ml-2">
              <StepItem number={1} title="打开操作日志">
                在左侧导航栏点击「操作日志」。
              </StepItem>
              <StepItem number={2} title="筛选和查看">
                按产品名称、操作类型、时间范围等条件筛选，查看历史操作记录。
              </StepItem>
              <StepItem number={3} title="出问题时优先看这里">
                当不确定数据是否被修改时，先查看操作日志确认最近有哪些人做了什么操作。
              </StepItem>
            </div>
          </div>

          {/* 录入注意提示 */}
          <div className="mb-6">
            <div className="p-3 rounded-md border bg-slate-50 border-slate-200">
              <div className="text-sm font-medium text-slate-800 mb-2">录入注意事项</div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside leading-relaxed">
                <li>SKU 编码不能重复，系统会实时检查</li>
                <li>产品没有货号时，可使用内部编号（如 LEGACY-NOCODE-0001），产品名称保持真实</li>
                <li>采购价、售价未知时请留空，不要填 0，留空表示未知</li>
                <li>当前库存数量请人工确认后准确填写</li>
                <li>发现录错时优先使用撤销功能或按流程修正，不要直接改库存数字</li>
                <li>重要操作前建议先创建数据库备份</li>
              </ul>
            </div>
          </div>

          {/* 产品核对状态说明 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-700 mb-3">产品核对状态说明</div>
            <div className="text-xs text-slate-600 mb-3 leading-relaxed">
              产品管理页面提供「核对状态」功能，帮助管理员在录入或编辑产品后快速判断资料是否完整。核对状态分为以下三种：
            </div>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5 p-2.5 bg-emerald-50 border border-emerald-100 rounded-md">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">信息完整</span>
                <div className="text-xs text-slate-700 leading-relaxed">
                  产品名称、SKU 编码、库存分类、存储位置、当前库存、最低库存等核心库存管理字段基本完整，可用于正式库存管理。
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 bg-amber-50 border border-amber-100 rounded-md">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 shrink-0 mt-0.5">建议补充</span>
                <div className="text-xs text-slate-700 leading-relaxed">
                  产品可以保存和查询，但部分辅助信息建议后续补齐，例如库位、单位等。该状态用于提醒管理员完善资料，不代表系统错误。
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 bg-rose-50 border border-rose-100 rounded-md">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700 shrink-0 mt-0.5">需核对</span>
                <div className="text-xs text-slate-700 leading-relaxed">
                  产品缺少关键字段，例如 SKU 编码、产品名称、当前库存或最低库存设置异常。建议管理员优先核对后再正式使用。
                </div>
              </div>
            </div>
            <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 leading-relaxed">
              <span className="font-medium text-slate-700">补充说明：</span>
              采购价、售价如果暂时未知，可以先留空，后续核对后再补充。不建议用 0 代表未知价格，避免后续核对时误解。核对状态用于提高正式录入质量，不会强制阻止保存。
            </div>
          </div>
        </div>

        {/* ── 权限说明 ── */}
        <div className="border-t border-slate-100 pt-6">
          <div className="text-base font-semibold text-slate-800 mb-4 border-l-4 border-slate-500 pl-2.5">
            权限说明
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 border border-slate-200 rounded-md">
              <div className="text-sm font-semibold text-slate-800 mb-2">管理员（admin）</div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside leading-relaxed">
                <li>新增、编辑、删除产品</li>
                <li>录入入库和出库</li>
                <li>撤销出入库记录</li>
                <li>创建数据库备份</li>
                <li>执行恢复预检和恢复准备</li>
                <li>导出产品 CSV</li>
                <li>查看所有操作日志和台账</li>
              </ul>
            </div>
            <div className="p-3.5 border border-slate-200 rounded-md">
              <div className="text-sm font-semibold text-slate-800 mb-2">查看人员（viewer）</div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside leading-relaxed">
                <li>查看产品列表和库存状态</li>
                <li>查看库存台账</li>
                <li>查看操作日志</li>
                <li>查看仪表盘和低库存预警</li>
                <li>查看备份状态和恢复预检结果</li>
                <li>查看系统使用说明</li>
                <li>不能新增、编辑、删除或导出数据</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── 常见问题 ── */}
        <div className="border-t border-slate-100 pt-6">
          <div className="text-base font-semibold text-slate-800 mb-4 border-l-4 border-slate-500 pl-2.5">
            常见问题
          </div>
          <div className="space-y-2">
            <FaqItem
              question="产品没有货号怎么办？"
              answer="可以使用内部编号，如 LEGACY-NOCODE-0001、LEGACY-NOCODE-0002 等。产品名称请保持真实名称，方便后续识别和管理。"
            />
            <FaqItem
              question="采购价、售价不知道怎么办？"
              answer="留空即可，不要填 0。0 表示「免费/零价格」，留空表示「未知」。后续知道价格后可以编辑补充。"
            />
            <FaqItem
              question="库存数量录错了怎么办？"
              answer="如果还没有正式开始出入库，可以直接编辑产品修改库存。如果已经正式使用，优先通过入库或出库记录来调整数量，并留下备注说明原因。系统会记录所有操作到操作日志和台账中。"
            />
            <FaqItem
              question="录入产品时 SKU 重复怎么办？"
              answer="系统会自动检查 SKU 是否重复。如果提示 SKU 已存在，请确认是否确实重复。如果是不同产品，请为其中一个修改 SKU 编码。"
            />
            <FaqItem
              question="产品名称重复了怎么办？"
              answer="系统会给出黄色提示，但不阻止保存。同一产品名称可能对应不同规格（如不同尺寸、不同包装）。如果确认是重复录入，删除多余的那个即可。"
            />
            <FaqItem
              question="为什么要导出 CSV 进行核对？"
              answer="导出 CSV 后，可以和外部数据来源进行逐条比对，确认产品数量一致、名称准确、SKU 正确、库存与实物相符、库位分配正确。"
            />
            <FaqItem
              question="恢复预检和准备恢复有什么区别？"
              answer="恢复预检只是检查备份文件是否完整可用（只读检查）。准备恢复会在预检通过后额外创建一份当前数据库的安全备份并生成恢复计划。两者都不会执行真正的恢复操作。"
            />
            <FaqItem
              question="为什么不建议直接修改数据库文件？"
              answer="直接修改数据库文件无法记录操作日志，容易破坏数据一致性，一旦出错难以恢复。应通过系统提供的功能进行操作，每步都有记录可追溯。"
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-400 text-center">
            本说明面向系统日常使用人员编写。如需更多帮助，请联系系统管理员。
          </div>
        </div>
      </div>
    </div>
  );
}
