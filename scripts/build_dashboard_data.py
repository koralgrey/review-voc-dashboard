#!/usr/bin/env python3
"""Build dashboard data from the review sheet in the source workbook.

Usage:
  python scripts/build_dashboard_data.py 评论.xlsx data
"""
import json
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

THEMES = {
    "质量做工": ["质量", "做工", "材质", "厚实", "结实", "耐用", "不锈钢", "铜", "阀芯", "毛刺", "破损", "坏", "裂", "漏水"],
    "颜色外观": ["颜色", "色差", "外观", "颜值", "质感", "好看", "漂亮", "发黄", "掉色", "褪色", "光泽"],
    "效果性能": ["效果", "性能", "防水", "防臭", "防霉", "排水", "密封", "粘", "牢", "覆盖", "遮盖", "耐磨", "防风", "隔音", "漏风", "漏水", "渗水", "固化", "干燥", "开裂", "发霉", "发黑", "起皮", "脱落", "起泡"],
    "安装施工": ["安装", "施工", "师傅", "打孔", "免打孔", "刷", "滚", "配比", "调配", "搅拌", "基层", "尺寸", "开孔", "打胶", "填缝", "勾缝", "美缝", "清缝", "刮涂", "喷涂", "不好装"],
    "气味环保": ["气味", "味道", "刺鼻", "环保", "甲醛", "净味", "无味", "入住", "有味"],
    "客服售后": ["客服", "售后", "服务", "退货", "退款", "补发", "赔偿", "处理", "推脱", "态度"],
    "物流包装": ["物流", "快递", "包装", "运输", "漏液", "破损", "少发", "漏发", "发货", "到货"],
}
CATEGORY_THEMES = {
    "勾缝剂": ["颜色外观", "效果性能", "安装施工", "质量做工"],
    "地漏": ["质量做工", "颜色外观", "效果性能", "安装施工"],
    "环氧漆(地坪漆)": ["效果性能", "安装施工", "客服售后", "质量做工"],
    "玻璃胶": ["效果性能", "质量做工", "气味环保", "安装施工"],
    "金属漆": ["质量做工", "效果性能", "颜色外观", "物流包装"],
    "防水涂料": ["效果性能", "质量做工", "安装施工", "物流包装"],
}
POSITIVE = ["满意", "不错", "很好", "好用", "漂亮", "好看", "质感", "结实", "厚实", "方便", "顺滑", "牢固", "没味", "无味", "低味", "值得", "推荐", "专业", "及时", "耐用", "省心", "效果好"]
NEGATIVE = ["很差", "太差", "差劲", "失望", "不好", "难用", "破损", "漏水", "渗水", "漏液", "漏风", "掉色", "色差", "起皮", "脱落", "起泡", "开裂", "发霉", "发黑", "发黄", "刺鼻", "难闻", "少发", "漏发", "退货", "退款", "投诉", "推脱", "不理", "不符", "坏", "溢", "返味", "反味", "关不上", "不够", "误导", "麻烦"]
PEOPLE = {"装修业主": ["装修", "新房", "家装"], "DIY用户": ["自己动手", "自己刷", "自己装", "DIY", "新手"], "施工师傅": ["师傅", "工人", "瓦工", "油工"], "儿童/老人家庭": ["儿童", "孩子", "宝宝", "老人"], "租住用户": ["租房", "出租房", "房东"], "工程用户": ["工程", "车间", "工厂", "仓库"]}
SCENES = {"卫生间": ["卫生间", "浴室", "淋浴"], "厨房": ["厨房", "水槽", "洗碗机"], "阳台": ["阳台", "洗衣机"], "墙面翻新": ["旧墙", "墙面", "补墙", "翻新"], "地面施工": ["地面", "车库", "水泥地", "地坪"], "门窗改善": ["门窗", "门缝", "窗户", "漏风"], "户外环境": ["外墙", "围墙", "户外", "天井"], "金属翻新": ["暖气", "铁门", "铁艺", "彩钢瓦"]}
PURPOSES = {"改色美化": ["改色", "颜色", "美化", "好看", "漂亮"], "防水防漏": ["防水", "漏水", "防漏"], "防臭排水": ["防臭", "返味", "排水"], "牢固耐用": ["牢固", "耐用", "结实", "粘性"], "低味环保": ["环保", "无味", "低味", "甲醛"], "修补翻新": ["修补", "翻新", "补墙", "遮盖"], "安装省事": ["安装方便", "免打孔", "自己装", "省事"], "收纳省空间": ["收纳", "折叠", "省空间"]}
KEYWORDS = {"质量": ["质量"], "做工": ["做工", "毛刺"], "颜色": ["颜色", "色差", "掉色"], "效果": ["效果", "好用"], "安装": ["安装", "施工"], "客服": ["客服", "售后"], "物流": ["物流", "快递"], "包装": ["包装", "破损", "漏液"], "气味": ["气味", "味道", "刺鼻"], "环保": ["环保", "甲醛", "净味"], "材质": ["材质", "不锈钢", "黄铜", "全铜"], "尺寸适配": ["尺寸", "开孔", "适配", "太厚", "太薄"], "耐用": ["耐用", "结实", "牢固"], "防水": ["防水"], "防臭排水": ["防臭", "返味", "排水"], "遮盖力": ["遮盖", "覆盖"], "用量": ["用量", "不够", "面积"], "工具配套": ["工具", "刷子", "手套"], "性价比": ["性价比", "划算", "价格"], "品牌信任": ["品牌", "旗舰店", "正品"]}

# 消费者关注点为稳定的跨品类一级分类。一条评论可同时命中多个大类，
# 因此“提及率”相加不必等于 100%。每月更新时使用同一套大类保持可比性。
FOCUS_TOPICS = {
    "性能效果": ["效果", "性能", "防水", "防臭", "防霉", "排水", "返味", "反味", "密封", "隔音", "防风", "漏风", "漏水", "渗水", "遮盖", "覆盖", "耐磨", "粘结", "粘性", "固化", "干燥", "开裂", "发霉", "发黑", "起皮", "脱落", "起泡", "防锈", "排水速度"],
    "质量材质": ["质量", "做工", "材质", "用料", "厚实", "结实", "耐用", "牢固", "不锈钢", "黄铜", "全铜", "铜", "阀芯", "毛刺", "生锈", "破损", "开裂", "断裂"],
    "外观设计": ["外观", "颜值", "颜色", "色差", "好看", "漂亮", "造型", "款式", "设计", "光泽", "质感", "掉色", "褪色", "发黄"],
    "安装适配": ["安装", "施工", "师傅", "打孔", "免打孔", "开孔", "孔位", "尺寸", "适配", "接口", "配件", "配套", "配比", "调配", "搅拌", "基层", "滚刷", "刷涂", "打胶", "填缝", "勾缝", "美缝", "清缝", "刮涂", "喷涂", "不好装", "自己装"],
    "品牌信任": ["品牌", "大牌", "名牌", "旗舰店", "官方旗舰", "正品", "假货", "授权"],
    "气味环保": ["气味", "味道", "刺鼻", "难闻", "环保", "甲醛", "净味", "无味", "没味", "低味", "入住", "材料味", "油漆味", "胶味"],
    "服务售后": ["客服", "售后", "服务", "退货", "退款", "换货", "补发", "赔偿", "售后处理", "客服处理", "处理问题", "推脱", "态度", "响应"],
    "物流包装": ["物流", "快递", "包装", "运输", "漏液", "破包", "少发", "漏发", "错发", "发货", "到货"],
    "价格价值": ["性价比", "价格", "价钱", "划算", "便宜", "实惠", "超值", "太贵", "贵了", "优惠"],
}

# 二级焦点用于解释一级大类，保留品类语境，不参与大类之间的直接比较。
CATEGORY_FOCUS_DETAILS = {
    "勾缝剂": {"颜色搭配与色差": ["颜色", "色差", "同色", "亮光", "哑光"], "防水防霉": ["防水", "防霉", "渗水", "发霉", "发黑"], "固化粘接耐久": ["固化", "干燥", "硬实", "牢固", "开裂", "脱落", "起边"], "清缝填缝施工": ["清缝", "填缝", "打胶", "收光", "压缝", "施工", "调配"]},
    "地漏": {"排水": ["排水", "下水", "积水", "溢"], "防臭返味": ["防臭", "返味", "反味", "异味"], "防虫防回流": ["防虫", "虫子", "止回", "逆止", "回流"], "尺寸芯体适配": ["尺寸", "管径", "深度", "地漏芯", "开孔", "三通"]},
    "防水涂料": {"补漏防渗": ["补漏", "防水", "漏水", "渗水"], "附着与耐久": ["附着", "起皮", "脱落", "开裂", "起泡", "耐用"], "涂刷用量": ["涂刷", "滚刷", "用量", "面积", "不够"], "基层场景适配": ["屋顶", "外墙", "卫生间", "窗台", "裂缝", "水泥"]},
    "玻璃胶": {"密封防水": ["密封", "防水", "漏水", "渗水", "漏风"], "防霉防黄": ["防霉", "发霉", "发黑", "发黄", "变黄"], "固化与粘接": ["固化", "干燥", "粘接", "粘合", "牢固", "开裂"], "打胶施工": ["打胶", "挤胶", "胶枪", "塑形", "刮胶", "施工"]},
    "艺术漆": {"颜色色差": ["颜色", "色差", "发黄", "变色"], "遮盖附着": ["遮盖", "覆盖", "附着", "起皮", "脱落"], "DIY施工": ["DIY", "新手", "自己刷", "施工", "教程"], "光泽质感": ["光泽", "质感", "纹理", "哑光"]},
    "水槽套餐": {"盆体材质": ["304", "不锈钢", "盆体", "厚度"], "龙头功能": ["龙头", "抽拉", "出水", "花洒"], "开孔设备适配": ["开孔", "孔位", "净水器", "洗碗机"], "下水密封": ["下水", "漏水", "密封", "排水"]},
    "内墙乳胶漆": {"净味环保": ["净味", "甲醛", "无味", "入住"], "上墙颜色": ["上墙", "颜色", "色差", "色卡"], "遮盖力": ["遮盖", "覆盖", "透底"], "墙面耐久": ["起皮", "脱落", "开裂", "发霉"]},
    "环氧漆(地坪漆)": {"耐磨附着": ["耐磨", "附着", "起皮", "脱落"], "用量面积": ["用量", "面积", "不够", "补买"], "配比固化": ["配比", "固化", "干燥", "不干"], "颜色批次": ["色差", "批次", "补货", "颜色"]},
    "密封条": {"防风隔音": ["防风", "漏风", "隔音", "噪音"], "厚度缝隙适配": ["太厚", "太薄", "缝隙", "门缝", "关不上"], "背胶粘性": ["背胶", "粘性", "粘不", "脱落"], "材质气味": ["材质", "气味", "硬", "软"]},
    "外墙乳胶漆": {"耐候防水": ["耐候", "防水", "下雨", "户外"], "掉色掉粉": ["掉色", "掉粉", "褪色", "冲掉"], "遮盖附着": ["遮盖", "附着", "起皮", "脱落"], "颜色光照": ["颜色", "色差", "光照", "发黄"]},
    "瓷砖胶": {"粘结牢固": ["粘结", "牢固", "空鼓", "脱落"], "型号瓷砖适配": ["型号", "吸水率", "大砖", "瓷砖", "背胶"], "配比施工": ["配比", "施工", "基层", "师傅"], "运输破包": ["破包", "破损", "漏", "撒"]},
    "腻子": {"找平遮盖": ["找平", "遮盖", "补墙", "不平"], "打磨细腻": ["打磨", "颗粒", "细腻", "粗糙"], "附着耐久": ["附着", "起皮", "脱落", "开裂"], "局部色差": ["色差", "太白", "发黄", "补丁"]},
    "毛巾架": {"承重牢固": ["承重", "牢固", "掉下来", "脱落"], "免打孔安装": ["免打孔", "打孔", "安装", "胶"], "材质防锈": ["材质", "不锈钢", "生锈", "掉漆"], "尺寸结构": ["尺寸", "孔距", "折叠", "收纳"]},
    "角阀": {"阀芯密封": ["阀芯", "密封", "漏水", "渗水"], "铜材用料": ["黄铜", "全铜", "材质", "塑料"], "开关顺滑": ["开关", "顺滑", "卡顿", "快开"], "螺纹尺寸": ["螺纹", "尺寸", "太短", "太长", "装饰盖"]},
    "金属漆": {"附着防锈": ["附着", "防锈", "除锈", "起皮", "脱落"], "遮盖用量": ["遮盖", "用量", "面积", "不够"], "颜色光泽": ["颜色", "色差", "光泽", "喷涂"], "施工处理": ["打磨", "除锈", "刷涂", "干燥"]},
}
PROBLEMS = {
    "勾缝剂": [("颜色搭配与色差", ["色差", "颜色不一致", "颜色不一样", "颜色不对", "颜色不好看", "太深", "太浅", "发黄"], "线上色卡、瓷砖底色与实际固化效果存在差异", "大面积施工后返工成本高"), ("固化开裂或脱落", ["不干", "不固化", "开裂", "脱落", "起边", "空鼓"], "调配、清缝深度、环境湿度或施工时间未匹配", "缝隙密封与长期观感失效"), ("用量与施工门槛", ["不够", "难打", "难用", "不好施工", "费劲", "费时间", "清不干净"], "缝宽缝深、工具熟练度和损耗未纳入估算", "中途补货或增加人工成本")],
    "地漏": [("排水与防臭冲突", ["排不出去", "排水慢", "溢", "返味", "反味"], "防臭芯阻力、管径或安装深度不匹配", "积水或返味，核心功能失效"), ("表面耐久与到货损伤", ["掉色", "褪色", "磕", "破损", "划痕"], "表面处理耐久或运输防护不足", "破坏高价品牌的品质预期"), ("安装适配不清", ["尺寸不合", "尺寸不对", "装不上", "无法安装", "安装不了", "不好安装", "三通", "太高", "太深"], "选型信息没有覆盖管径、深度和排水结构", "返工并放大售后成本")],
    "防水涂料": [("补漏后仍渗漏", ["还漏水", "仍漏水", "不防水", "渗水", "漏水"], "基层裂缝、节点处理、涂层厚度或施工天气不满足要求", "核心防水任务未解决并可能扩大损失"), ("起泡起皮与开裂", ["起泡", "起皮", "脱落", "开裂"], "基层含水、清洁度、涂层间隔或材料适配不足", "短期脱层，耐久性失效"), ("用量不足与场景误用", ["不够", "量太少", "严重不足", "没刷多大", "双倍的料", "补买"], "不同基层吸收率和涂刷遍数未进入用量估算", "施工中断并增加补货成本")],
    "玻璃胶": [("固化与粘接失败", ["不凝固", "不固化", "不干", "一拉就掉", "没有粘合度", "开裂"], "胶型、施工厚度、温湿度或基面清洁不匹配", "密封结构失效并需铲除重做"), ("防霉防黄耐久", ["发霉", "发黑", "发黄", "变黄"], "潮湿环境、胶体耐候性或日常清洁条件影响", "厨卫观感和卫生体验下降"), ("颜色与打胶操作", ["色差", "难挤", "难用", "太快干", "不好打"], "电子色卡、出胶速度和用户熟练度存在偏差", "成型不整齐或材料浪费")],
    "艺术漆": [("实物色差与批次差", ["色差", "颜色不", "不一样", "发黄", "变色"], "屏幕、基层和补货批次共同影响显色", "整面返工且难以局部修复"), ("附着失败", ["起皮", "脱落", "翘", "开裂", "起泡"], "基层处理、间隔时间或罩面步骤缺失", "翻新效果短期失效"), ("DIY门槛被低估", ["难刷", "不好刷", "施工", "新手", "教程"], "宣传的简单操作与真实工序不一致", "增加试错、材料和人工成本")],
    "水槽套餐": [("开孔与设备不适配", ["开孔", "孔位", "净水器", "洗碗机", "尺寸"], "下单前缺少台面和外接设备确认", "安装后才暴露，返工成本高"), ("配件错漏阻断安装", ["少发", "漏发", "缺", "配件", "错发"], "多部件套餐清单与复核不足", "师傅等待或二次上门"), ("盆体或龙头质量", ["漏水", "生锈", "划痕", "变形", "坏"], "运输防护、焊接或部件品控波动", "影响厨房长期使用")],
    "内墙乳胶漆": [("环保承诺口径冲突", ["8小时", "入住", "甲醛", "味道", "刺鼻"], "营销承诺与客服解释条件不一致", "形成健康焦虑和品牌不信任"), ("上墙颜色偏差", ["色差", "颜色不", "太深", "太浅", "发黄"], "屏幕、色卡、光线和干燥过程影响判断", "整墙重刷"), ("旧墙问题与漆效混杂", ["发霉", "开裂", "起皮", "脱落", "基层"], "施工前未诊断墙体含水或旧涂层", "责任难界定、售后争议")],
    "环氧漆(地坪漆)": [("用量承诺不足", ["不够", "量太少", "严重不足", "少了", "补买", "双倍的料"], "基层粗糙度与施工方式未纳入估算", "中途停工并增加人工费"), ("补货批次色差", ["色差", "颜色不一致", "颜色不一样", "补货后", "不同批次"], "同一工程未锁定生产批次", "大面积地面难局部修复"), ("起泡起皮", ["起泡", "起皮", "脱落", "翘", "不开"], "含水率、配比、温度或养护条件不满足", "耐久性失效")],
    "密封条": [("厚度选择两难", ["太厚", "太薄", "关不上", "漏风", "门缝"], "缺少可操作的缝隙测量和规格匹配", "安装后仍漏风或无法关门"), ("背胶与安装失败", ["粘不", "掉", "背胶", "助粘", "脱落"], "表面清洁、胶层或固化时间不匹配", "短期失效并留下残胶"), ("气味与材质感", ["味道", "气味", "刺鼻", "硬", "薄"], "材料配方和厚薄预期不一致", "卧室等封闭空间体验差")],
    "外墙乳胶漆": [("雨后掉色掉粉", ["掉色", "掉粉", "下雨", "冲掉", "褪色"], "施工天气窗口或耐候性能不足", "外立面快速失效"), ("颜色氧化偏差", ["色差", "发黄", "变色", "颜色不"], "光照、批次和基层吸收差异", "大面积观感不一致"), ("工具与包装履约", ["少发", "漏发", "破损", "漏液", "工具"], "桶装防护或套装配货复核不足", "打断连续施工")],
    "瓷砖胶": [("运输破包", ["破损", "破包", "漏", "烂", "撒"], "大包装运输防护不足", "材料损耗且退货运费高"), ("产品选型混淆", ["双组份", "背胶", "型号", "不适合", "选错"], "砖尺寸、吸水率和基层的匹配信息不足", "空鼓脱落风险"), ("粘结与施工争议", ["脱落", "空鼓", "粘不", "不牢", "开裂"], "材料选择、配比与师傅工艺相互影响", "返工且责任难划分")],
    "腻子": [("产品用途误解", ["底漆", "面漆", "直接刷", "脱落", "起皮"], "用户混淆找平、补坑与改色功能", "错误施工导致墙皮失效"), ("局部修补色差", ["色差", "颜色不", "太白", "发黄"], "新旧墙面老化程度不同", "补丁明显"), ("打磨与遮盖不足", ["难打磨", "遮不", "盖不住", "不平", "颗粒"], "稠度、施工厚度或工具不匹配", "修补效果粗糙")],
    "毛巾架": [("免打孔坠落", ["掉下来", "掉了", "粘不", "砸", "脱落"], "墙面材质、潮湿环境与胶体承重不匹配", "可能砸伤人或损坏洁具"), ("材质与表面耐久", ["生锈", "掉漆", "划痕", "变色", "薄"], "潮湿耐腐蚀或表面处理不足", "长期观感和承重信任下降"), ("尺寸结构不适配", ["尺寸", "太大", "太小", "孔距", "安装"], "购买前缺少空间和孔距校验", "无法安装或影响动线")],
    "角阀": [("漏水与阀芯失效", ["漏水", "渗水", "坏", "关不", "阀芯"], "密封、阀芯或装配品控波动", "隐蔽工程存在财产安全风险"), ("材质预期差", ["全铜", "黄铜", "材质", "塑料", "生锈"], "材质描述与用户对重量、颜色的判断不一致", "削弱品牌信任"), ("墙体尺寸适配", ["尺寸", "螺纹", "太短", "太长", "装饰盖"], "贴砖厚度和接口深度未提前确认", "安装外露或无法连接")],
    "金属漆": [("免打磨理解偏差", ["免打磨", "不用打磨", "不打磨", "起皮", "脱落", "粘不"], "宣传让用户忽略锈蚀等级与基层清洁", "附着失败"), ("覆盖面积不足", ["不够", "量太少", "严重不足", "喷一点就没", "补买"], "喷涂与刷涂损耗、锈面粗糙度未区分", "中途补货并可能产生色差"), ("桶装漏液与工具丢失", ["漏液", "洒了", "破损", "工具丢", "少发"], "桶盖二次密封与附件固定不足", "无法按计划开工")],
}

def usable(value):
    text = str(value).strip()
    return bool(text and text.lower() != "nan" and not re.fullmatch(r"[\W_\d]+", text) and len(re.sub(r"\s+", "", text)) >= 4)

def rates(rows, mapping, limit):
    result, n = [], len(rows)
    for label, terms in mapping.items():
        count = int(rows["text"].map(lambda text: any(term in text for term in terms)).sum())
        if count:
            result.append([label, count, round(count * 100 / n, 1)])
    return sorted(result, key=lambda item: (-item[1], item[0]))[:limit]

def matched_labels(text, mapping):
    return [label for label, terms in mapping.items() if any(term in text for term in terms)]

NEGATIVE_NEGATIONS = {
    "漏水": ["不漏水", "没漏水", "没有漏水", "不会漏水", "无漏水", "防漏水"],
    "渗水": ["不渗水", "没渗水", "没有渗水", "不会渗水", "无渗水", "防渗水"],
    "漏风": ["不漏风", "没漏风", "没有漏风", "不会漏风", "防漏风"],
    "返味": ["不返味", "没返味", "没有返味", "不会返味", "防止返味", "隔绝返味"],
    "反味": ["不反味", "没反味", "没有反味", "不会反味", "防止反味", "隔绝反味"],
    "色差": ["没色差", "没有色差", "无色差"],
    "起皮": ["不起皮", "没起皮", "没有起皮", "不容易起皮"],
    "脱落": ["不脱落", "没脱落", "没有脱落", "不容易脱落"],
    "起泡": ["不起泡", "没起泡", "没有起泡", "不容易起泡"],
    "开裂": ["不开裂", "没开裂", "没有开裂", "不容易开裂"],
    "发霉": ["不发霉", "没发霉", "没有发霉", "不容易发霉"],
    "发黑": ["不发黑", "没发黑", "没有发黑", "不容易发黑"],
    "发黄": ["不发黄", "没发黄", "没有发黄", "不会发黄"],
    "掉色": ["不掉色", "没掉色", "没有掉色", "不容易掉色"],
    "刺鼻": ["不刺鼻", "无刺鼻", "没有刺鼻"],
    "难闻": ["不难闻", "没有难闻"],
    "破损": ["无破损", "没破损", "没有破损"],
}

def matched_negative_terms(text):
    result = []
    for word in NEGATIVE:
        if word not in text:
            continue
        if word in NEGATIVE_NEGATIONS and term_is_negated(text, word):
            continue
        result.append(word)
    return result

def term_is_negated(text, term):
    positions, start = [], 0
    while True:
        index = text.find(term, start)
        if index < 0:
            break
        positions.append(index)
        start = index + len(term)
    if not positions:
        return False
    markers = ["不", "没", "无", "避免", "防止", "隔绝"]
    return all(any(marker in text[max(0, index - 8):index] for marker in markers) for index in positions)

def matched_focus_labels(text):
    labels = []
    for label, terms in FOCUS_TOPICS.items():
        hits = [term for term in terms if term in text]
        if not hits:
            continue
        # “包装质量”归入物流包装；只有同时出现材质/做工等词才再计入质量材质。
        if label == "质量材质" and set(hits) == {"质量"} and "包装质量" in text:
            continue
        labels.append(label)
    return labels

def term_has_failure_occurrence(text, term):
    start = 0
    negation_markers = ["不", "没", "无", "避免", "防止", "隔绝"]
    context_markers = ["担心", "希望", "普通", "白水泥", "旧的", "原来", "买来补", "用来补", "为了补"]
    while True:
        index = text.find(term, start)
        if index < 0:
            return False
        prefix = text[max(0, index - 12):index]
        if not any(marker in prefix for marker in negation_markers + context_markers):
            return True
        start = index + len(term)

def problem_text_match(title, terms, text):
    if not any(term_has_failure_occurrence(text, term) for term in terms):
        return False
    if title == "排水与防臭冲突":
        clear_failure = any(term in text for term in ["排不出去", "排水慢", "溢", "返味"])
        positive_anti_odor = any(term in text for term in ["防止反味", "没有反味", "无反味", "不反味", "隔绝反味"])
        if positive_anti_odor and not clear_failure:
            return False
    return True

def matched_problems(category, text):
    return [title for title, terms, _, _ in PROBLEMS[category] if problem_text_match(title, terms, text)]

def normalize_rating(value):
    value = str(value).strip()
    return value if value in {"好评", "中评", "差评"} else ""

def theme_detail(theme, rows):
    words = THEMES[theme]
    matched = rows[rows["text"].map(lambda text: any(word in text for word in words))].copy()
    count, total = len(matched), len(rows)
    rate = round(count * 100 / total, 1) if total else 0
    if not count:
        return {"count": 0, "rate": 0, "summary": "当前筛选范围内未检出足够的明确主题表达。"}
    positive = Counter(word for text in matched["text"] for word in POSITIVE if word in text)
    negative = Counter(word for text in matched["text"] for word in matched_negative_terms(text))
    positive_text = "、".join(word for word, _ in positive.most_common(3)) or "功能达到预期"
    negative_text = "、".join(word for word, _ in negative.most_common(3)) or "风险表达较分散"
    confidence = "可优先跟踪" if count >= 100 else "方向性信号" if count >= 30 else "探索性信号"
    summary = f"命中{count}条去重评论，占当前筛选评论{rate}%，属于{confidence}。认可集中在“{positive_text}”，风险集中在“{negative_text}”；提及率不等于满意度。"
    return {"count": count, "rate": rate, "summary": summary}

def problem_details(category, rows):
    total, result = len(rows), []
    for title, terms, cause, impact in PROBLEMS[category]:
        matched = rows[rows["text"].map(lambda text: problem_text_match(title, terms, text))].copy()
        if matched.empty:
            continue
        result.append({"title": title, "count": int(len(matched)), "rate": round(len(matched) * 100 / total, 1), "cause": cause, "impact": impact})
    return sorted(result, key=lambda item: -item["count"])

def segment(rows, theme_names):
    rows = rows.drop_duplicates("text")
    total = len(rows)
    if not total:
        return None
    positive_count = int(rows["text"].map(lambda text: sum(word in text for word in POSITIVE) > len(matched_negative_terms(text))).sum())
    risk_count = int(rows["text"].map(lambda text: bool(matched_negative_terms(text))).sum())
    positive_rate, risk_rate = round(positive_count * 100 / total, 1), round(risk_count * 100 / total, 1)
    flags = {theme: rows["text"].map(lambda text, words=THEMES[theme]: any(word in text for word in words)) for theme in theme_names}
    co = []
    for index, first in enumerate(theme_names):
        for second in theme_names[index + 1:]:
            count = int((flags[first] & flags[second]).sum())
            if count:
                co.append([f"{first} × {second}", count, round(count * 100 / total, 1)])
    positive_terms = Counter(word for text in rows["text"] for word in POSITIVE if word in text).most_common(4)
    negative_terms = Counter(word for text in rows["text"] for word in matched_negative_terms(text)).most_common(4)
    return {"n": total, "score": round(max(1, min(5, 3 + .02 * (positive_rate - risk_rate))), 1), "positiveRate": positive_rate, "riskRate": risk_rate,
            "confidence": "稳定" if total >= 100 else "方向性" if total >= 30 else "探索性", "themes": {theme: theme_detail(theme, rows) for theme in theme_names},
            "people": rates(rows, PEOPLE, 3), "scenes": rates(rows, SCENES, 3), "purposes": rates(rows, PURPOSES, 4), "keywords": rates(rows, KEYWORDS, 8),
            "co": sorted(co, key=lambda item: -item[1])[:3], "problems": problem_details(rows.iloc[0]["category"], rows), "positiveTerms": [[word, count] for word, count in positive_terms], "negativeTerms": [[word, count] for word, count in negative_terms]}

def build(source, output):
    workbook = pd.ExcelFile(source)
    sheet_name = next((name for name in ("天猫_评论", "天猫评论", "评论") if name in workbook.sheet_names), None)
    if sheet_name is None:
        raise ValueError(f"missing review sheet: expected one of ['天猫_评论', '天猫评论', '评论'], found {workbook.sheet_names}")
    raw = pd.read_excel(workbook, sheet_name=sheet_name, dtype={"商品ID": str})
    raw["source_row"] = raw.index + 2
    required = {"商品ID", "店铺", "品类", "初评时间", "初评", "有用"}
    missing = required.difference(raw.columns)
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")
    raw["product_id"] = raw["商品ID"].fillna("").astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    if raw["product_id"].eq("").any():
        raise ValueError(f"missing 商品ID in {int(raw['product_id'].eq('').sum())} review rows")
    scope_rows = raw[["product_id", "店铺", "品类"]].drop_duplicates().copy()
    if "匹配表" in workbook.sheet_names:
        mapping = pd.read_excel(workbook, sheet_name="匹配表", dtype={"商品ID": str})
        mapping["product_id"] = mapping["商品ID"].fillna("").astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
        mapping = mapping[mapping["product_id"].ne("")]
        review_ids, mapping_ids = set(raw["product_id"]), set(mapping["product_id"])
        if review_ids != mapping_ids:
            added, missing_ids = sorted(review_ids - mapping_ids), sorted(mapping_ids - review_ids)
            raise ValueError(f"商品ID与匹配表不一致: 评论表独有={added}, 匹配表未抓取={missing_ids}")
        scope_rows = mapping[["product_id", "店铺", "品类"]].drop_duplicates().copy()
    if scope_rows["product_id"].duplicated().any():
        duplicate_ids = sorted(scope_rows.loc[scope_rows["product_id"].duplicated(False), "product_id"].unique())
        raise ValueError(f"商品ID存在多个店铺或品类映射: {duplicate_ids}")
    raw["date_value"] = pd.to_datetime(raw["初评时间"], errors="coerce")
    raw["shop"] = raw["店铺"].fillna("").astype(str).str.strip()
    raw["category"] = raw["品类"].fillna("").astype(str).str.strip()
    raw["rating"] = raw["评价类型"].map(normalize_rating) if "评价类型" in raw.columns else ""
    rating_source = raw[raw["date_value"].notna() & raw["shop"].ne("") & raw["category"].ne("")].copy()
    raw_export = raw[raw["初评"].fillna("").astype(str).str.strip().ne("") & raw["date_value"].notna()].copy()
    raw_export["text"] = raw_export["初评"].astype(str).str.strip()
    raw_export["shop"] = raw_export["店铺"].fillna("").astype(str).str.strip()
    raw_export["category"] = raw_export["品类"].fillna("").astype(str).str.strip()
    raw_export["date"] = raw_export["date_value"].dt.strftime("%Y-%m-%d")
    raw_export["helpful"] = pd.to_numeric(raw_export["有用"], errors="coerce").fillna(0)
    raw = raw[raw["初评"].map(usable) & raw["date_value"].notna()].copy()
    raw["text"] = raw["初评"].astype(str).str.strip(); raw["shop"] = raw["店铺"].astype(str).str.strip(); raw["category"] = raw["品类"].astype(str).str.strip()
    source_categories, configured_categories = set(raw["category"]), set(CATEGORY_THEMES)
    if source_categories != configured_categories:
        raise ValueError(f"品类范围与分析规则不一致: 未配置={sorted(source_categories-configured_categories)}, 本次缺失={sorted(configured_categories-source_categories)}")
    raw["date"] = raw["date_value"].dt.strftime("%Y-%m-%d")
    raw["month"] = raw["date_value"].map(lambda value: f"{value.year}年{value.month}月"); raw["helpful"] = pd.to_numeric(raw["有用"], errors="coerce").fillna(0)
    months = sorted(raw["month"].unique(), key=lambda label: tuple(map(int, re.findall(r"\d+", label))))
    result = {"months": months, "minDate": rating_source["date_value"].min().strftime("%Y-%m-%d"), "maxDate": rating_source["date_value"].max().strftime("%Y-%m-%d"), "categories": {}}
    category_summaries = {}
    for category, theme_names in CATEGORY_THEMES.items():
        category_rows = raw[raw["category"] == category]
        shops = category_rows["shop"].value_counts().index.tolist(); segments = {}
        for month in ["全部时间"] + months:
            month_rows = category_rows if month == "全部时间" else category_rows[category_rows["month"] == month]
            for shop in ["全部店铺"] + shops:
                rows = month_rows if shop == "全部店铺" else month_rows[month_rows["shop"] == shop]
                if not rows.empty:
                    segments[f"{month}|{shop}"] = segment(rows, theme_names)
        detail_mapping = CATEGORY_FOCUS_DETAILS.get(category, {})
        review_rows = []
        for _, row in category_rows.drop_duplicates("text").iterrows():
            text = row["text"]
            positive_terms = [word for word in POSITIVE if word in text]
            negative_terms = matched_negative_terms(text)
            review_rows.append({"shop": row["shop"], "date": row["date"], "month": row["month"], "helpful": float(row["helpful"]),
                                "themes": matched_labels(text, {name: THEMES[name] for name in theme_names}),
                                "focuses": matched_focus_labels(text), "focusDetails": matched_labels(text, detail_mapping),
                                "keywords": matched_labels(text, KEYWORDS), "purposes": matched_labels(text, PURPOSES),
                                "people": matched_labels(text, PEOPLE), "scenes": matched_labels(text, SCENES),
                                "problems": matched_problems(category, text), "positiveTerms": positive_terms,
                                "negativeTerms": negative_terms, "positive": len(positive_terms) > len(negative_terms),
                                "risk": bool(negative_terms)})
        category_rating_rows = rating_source[rating_source["category"] == category]
        rating_rows = [{"date": row["date_value"].strftime("%Y-%m-%d"), "shop": row["shop"], "rating": row["rating"]}
                       for _, row in category_rating_rows.iterrows()]
        rating_shops = category_rating_rows["shop"].value_counts().index.tolist()
        result["categories"][category] = {"productIdCount": int(category_rows["product_id"].nunique()), "shops": shops, "ratingShops": rating_shops, "segments": segments, "reviews": review_rows, "ratings": rating_rows}
        all_segment = segments.get("全部时间|全部店铺")
        source_volume, analysis_volume, unique = int(len(raw_export[raw_export["category"] == category])), int(len(category_rows)), int(category_rows["text"].nunique())
        category_summaries[category] = {"volume": source_volume, "unique": unique,
            "risk": all_segment["riskRate"] if all_segment else 0,
            "dup": round((analysis_volume - unique) * 100 / analysis_volume, 1) if analysis_volume else 0,
            "themes": [[name, all_segment["themes"][name]["count"], all_segment["themes"][name]["rate"]] for name in theme_names] if all_segment else []}
    target = Path(output)
    if target.suffix == ".js":
        target.write_text("window.REVIEW_FILTER_DATA=" + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
        return
    category_dir = target / "categories"
    category_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for index, (name, payload) in enumerate(result["categories"].items()):
        filename = f"category-{index:02d}.js"
        category_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        category_script = f"window.REVIEW_CATEGORY_DATA=window.REVIEW_CATEGORY_DATA||{{}};window.REVIEW_CATEGORY_DATA[{json.dumps(name, ensure_ascii=False)}]={category_json};\n"
        (category_dir / filename).write_text(category_script, encoding="utf-8")
        files[name] = f"categories/{filename}"
    current_ids = set(scope_rows["product_id"])
    scope_hashes = sorted(hashlib.sha256(product_id.encode("utf-8")).hexdigest() for product_id in current_ids)
    scope_path = target / "product-scope.json"
    if scope_path.exists() and "--accept-scope-change" not in sys.argv:
        previous = json.loads(scope_path.read_text(encoding="utf-8"))
        previous_hashes = set(previous.get("productIdHashes", []))
        if not previous_hashes and previous.get("products"):
            previous_hashes = {hashlib.sha256(str(row["productId"]).encode("utf-8")).hexdigest() for row in previous["products"]}
        if previous_hashes != set(scope_hashes):
            raise ValueError("长期商品ID范围发生变化；如确认变更请加 --accept-scope-change")
    scope_path.write_text(json.dumps({"count": len(current_ids), "productIdHashes": scope_hashes}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {"months": result["months"], "minDate": result["minDate"], "maxDate": result["maxDate"],
                "sourceRows": int(len(raw_export)), "analysisRows": int(len(raw)), "analysisUniqueRows": int(raw["text"].nunique()), "productIdCount": len(current_ids), "categorySummaries": category_summaries,
                "categories": files, "focusTopics": list(FOCUS_TOPICS)}
    manifest_json = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    (target / "manifest.js").write_text(f"window.REVIEW_MANIFEST={manifest_json};\n", encoding="utf-8")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_dashboard_data.py SOURCE.xlsx OUTPUT.js")
    build(sys.argv[1], sys.argv[2])
